const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';

const MAX_AUTO_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 3;
const BASE_RETRY_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 8000;
const OVERALL_TIMEOUT_MS = 45000;

// Module-level mock handler for automated tests
let mockHandler = null;

function isTransientError(error) {
  if (!error) return false;

  const status = Number(error.status || error.statusCode || error.code || error.error?.code);
  const statusStr = String(error.status || error.error?.status || '').toUpperCase();
  const msg = String(error.message || '').toLowerCase();

  // Explicit non-transient / permanent errors (MUST NOT RETRY)
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  if (
    statusStr === 'INVALID_ARGUMENT' ||
    statusStr === 'UNAUTHENTICATED' ||
    statusStr === 'PERMISSION_DENIED' ||
    statusStr === 'NOT_FOUND'
  ) {
    return false;
  }

  // Transient status codes
  if (status === 503 || status === 429 || status === 500 || status === 502 || status === 504) return true;
  if (statusStr === 'UNAVAILABLE' || statusStr === 'RESOURCE_EXHAUSTED' || statusStr === 'INTERNAL') return true;

  // Transient message patterns
  if (
    msg.includes('high demand') ||
    msg.includes('temporarily') ||
    msg.includes('unavailable') ||
    msg.includes('spikes in demand') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('socket hang up')
  ) {
    return true;
  }

  return false;
}

function parseRetryAfterMs(error) {
  try {
    const header =
      error.headers?.get?.('retry-after') ||
      error.response?.headers?.['retry-after'] ||
      error.error?.details?.find?.((d) => d['@type']?.includes('RetryInfo'))?.retryDelay;
    if (header) {
      const seconds = parseFloat(header);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
  } catch (_) {}
  return null;
}

async function executeWithRetry(
  operationName,
  executeFn,
  {
    maxRetries = MAX_AUTO_RETRIES,
    baseDelayMs = BASE_RETRY_DELAY_MS,
    maxDelayMs = MAX_RETRY_DELAY_MS,
    overallTimeoutMs = OVERALL_TIMEOUT_MS,
  } = {}
) {
  const startTime = Date.now();
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      return await executeFn(attempt);
    } catch (err) {
      lastError = err;
      attempt++;

      if (!isTransientError(err)) {
        // Permanent error, do not retry
        throw err;
      }

      if (attempt > maxRetries) {
        break;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= overallTimeoutMs) {
        break;
      }

      const retryAfterMs = parseRetryAfterMs(err);
      let waitMs;
      if (retryAfterMs !== null) {
        waitMs = Math.min(maxDelayMs, retryAfterMs);
      } else {
        const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
        const jitter = Math.random() * 500;
        waitMs = Math.min(maxDelayMs, expDelay + jitter);
      }

      if (elapsed + waitMs > overallTimeoutMs) {
        waitMs = Math.max(100, overallTimeoutMs - elapsed);
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

async function executeWithRetryAndFallback(operationName, executeFn) {
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';

  try {
    return await executeWithRetry(
      `${operationName} (${primaryModel})`,
      () => executeFn(primaryModel)
    );
  } catch (primaryErr) {
    if (!isTransientError(primaryErr)) {
      throw primaryErr;
    }

    if (fallbackModel && fallbackModel !== primaryModel) {
      try {
        return await executeWithRetry(
          `${operationName} (Fallback: ${fallbackModel})`,
          () => executeFn(fallbackModel),
          { maxRetries: 1, baseDelayMs: 1000 }
        );
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }

    throw primaryErr;
  }
}

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return 'An error occurred during Gemini AI processing.';
  
  // Format friendly message for transient overload
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('spikes in demand')) {
    return 'Gemini is temporarily busy due to high demand (503 UNAVAILABLE). Your recorded presentation is saved on the server. Please retry in a moment.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit')) {
    return 'Gemini request limit reached (429 RESOURCE_EXHAUSTED). Your recorded presentation is saved on the server. Please wait a moment and retry.';
  }

  return msg
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
    .replace(/AQ\.[0-9A-Za-z-_]+/g, '[REDACTED]');
}


/**
 * Validates and normalizes the structured Gemini analysis output
 * ensuring all 9 criteria from the specification are satisfied.
 */
function validateAndNormalizeAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini response is not a valid JSON object');
  }

  const analysis = parsed.analysis || parsed;

  // A. Executive summary
  const executiveSummary =
    typeof analysis.executiveSummary === 'string'
      ? analysis.executiveSummary.trim()
      : 'User addressed the assigned topic with clear core assertions.';

  // B. What user actually said
  const whatUserSaid = Array.isArray(analysis.whatUserSaid)
    ? analysis.whatUserSaid.map(String).filter(Boolean)
    : [];

  // C. Strengths
  const strengths = Array.isArray(analysis.strengths)
    ? analysis.strengths.map(String).filter(Boolean)
    : [];

  // D. Missing concepts
  const missingConcepts = Array.isArray(analysis.missingConcepts)
    ? analysis.missingConcepts
        .map((item) => ({
          concept: typeof item?.concept === 'string' ? item.concept.trim() : '',
          relevance: typeof item?.relevance === 'string' ? item.relevance.trim() : '',
        }))
        .filter((item) => item.concept && item.relevance)
    : [];

  // E. Accuracy and evidence
  const validCategories = [
    'demonstrably_incorrect',
    'requires_evidence',
    'debatable_interpretation',
    'unverified',
  ];
  const accuracyAndEvidence = Array.isArray(analysis.accuracyAndEvidence)
    ? analysis.accuracyAndEvidence
        .map((item) => {
          const cat = validCategories.includes(item?.category)
            ? item.category
            : 'requires_evidence';
          return {
            claim: typeof item?.claim === 'string' ? item.claim.trim() : '',
            assessment: typeof item?.assessment === 'string' ? item.assessment.trim() : '',
            category: cat,
          };
        })
        .filter((item) => item.claim && item.assessment)
    : [];

  // F. Reasoning and structure
  const rawStructure = analysis.reasoningAndStructure || {};
  const reasoningAndStructure = {
    introduction: typeof rawStructure.introduction === 'string' ? rawStructure.introduction.trim() : '',
    logicalProgression: typeof rawStructure.logicalProgression === 'string' ? rawStructure.logicalProgression.trim() : '',
    supportingArguments: typeof rawStructure.supportingArguments === 'string' ? rawStructure.supportingArguments.trim() : '',
    examples: typeof rawStructure.examples === 'string' ? rawStructure.examples.trim() : '',
    counterarguments: typeof rawStructure.counterarguments === 'string' ? rawStructure.counterarguments.trim() : '',
    conclusion: typeof rawStructure.conclusion === 'string' ? rawStructure.conclusion.trim() : '',
    digressions: typeof rawStructure.digressions === 'string' ? rawStructure.digressions.trim() : '',
  };

  // G. Clarity of expression
  const clarityOfExpression =
    typeof analysis.clarityOfExpression === 'string'
      ? analysis.clarityOfExpression.trim()
      : '';

  // H. A stronger answer
  const rawStronger = analysis.strongerAnswer || {};
  const strongerAnswer = {
    structure: typeof rawStronger.structure === 'string' ? rawStronger.structure.trim() : '',
    exampleRewrite: typeof rawStronger.exampleRewrite === 'string' ? rawStronger.exampleRewrite.trim() : '',
  };

  // I. Scores and action plan
  const normalizeScore = (raw, fallbackScore = 3) => {
    let score = Number(raw?.score);
    if (isNaN(score) || score < 1 || score > 5) score = fallbackScore;
    return {
      score: Math.round(score),
      explanation: typeof raw?.explanation === 'string' ? raw.explanation.trim() : '',
    };
  };

  const rawScores = analysis.scores || {};
  const scores = {
    clarity: normalizeScore(rawScores.clarity),
    structure: normalizeScore(rawScores.structure),
    topicRelevance: normalizeScore(rawScores.topicRelevance),
    reasoning: normalizeScore(rawScores.reasoning),
    evidenceAndExamples: normalizeScore(rawScores.evidenceAndExamples),
    overall: normalizeScore(rawScores.overall),
  };

  const actionPlan = Array.isArray(analysis.actionPlan)
    ? analysis.actionPlan.map(String).filter(Boolean).slice(0, 5)
    : [];

  const transcript =
    typeof parsed.transcript === 'string'
      ? parsed.transcript.trim()
      : typeof analysis.transcript === 'string'
      ? analysis.transcript.trim()
      : '';

  return {
    transcript,
    analysis: {
      executiveSummary,
      whatUserSaid,
      strengths,
      missingConcepts,
      accuracyAndEvidence,
      reasoningAndStructure,
      clarityOfExpression,
      strongerAnswer,
      scores,
      actionPlan,
    },
  };
}

/**
 * Constructs the rigorous diagnostic prompt enforcing all 9 evaluation criteria.
 */
function buildAnalysisPrompt(topicTitle, topicDescription) {
  return `You are an expert academic speech evaluation, rhetorical analysis, and epistemic reasoning coach for BrainDetour.
You are evaluating an oral response presented by a scholar on the following assigned topic:
Topic: "${topicTitle}"
Topic Context/Description: "${topicDescription || 'Explore and articulate the core empirical findings of this inquiry detour.'}"

Perform a thorough, objective, and constructive analysis strictly based on what the user actually said.

Return your response in pure JSON matching this exact structure:
{
  "transcript": "Exact and complete verbatim transcription of the user's speech.",
  "analysis": {
    "executiveSummary": "Comprehensive summary of the user's overall response and whether it successfully addressed the assigned topic.",
    "whatUserSaid": [
      "Main idea 1 actually spoken",
      "Argument or example 2 actually spoken"
    ],
    "strengths": [
      "Clear explanation of concept X",
      "Sound logical deduction between Y and Z"
    ],
    "missingConcepts": [
      {
        "concept": "Crucial missing concept or counterpoint",
        "relevance": "Why this perspective is necessary to formulate a comprehensive answer."
      }
    ],
    "accuracyAndEvidence": [
      {
        "claim": "Specific claim made by user",
        "assessment": "Critical evaluation of whether the claim is empirically supported or flawed.",
        "category": "demonstrably_incorrect" | "requires_evidence" | "debatable_interpretation" | "unverified"
      }
    ],
    "reasoningAndStructure": {
      "introduction": "Evaluation of hook, thesis definition, and initial direction.",
      "logicalProgression": "Evaluation of transitions and thematic coherence.",
      "supportingArguments": "Evaluation of substantiating claims and logical depth.",
      "examples": "Evaluation of relevance and grounding of examples cited.",
      "counterarguments": "Evaluation of acknowledgment of alternative views.",
      "conclusion": "Evaluation of synthesis and final takeaways.",
      "digressions": "Evaluation of any tangents, repetition, or off-topic detours."
    },
    "clarityOfExpression": "Evaluation of lexical precision, conciseness, and syntactic clarity. Note: Do not infer vocal tone, pronunciation, or acoustic confidence.",
    "strongerAnswer": {
      "structure": "Recommended structural outline for a gold-standard response on this topic.",
      "exampleRewrite": "An exemplar phrasing demonstrating how the user could articulate these points with maximal persuasive and epistemic rigor. (Make clear this is a suggested model, not what the user said)."
    },
    "scores": {
      "clarity": { "score": 1-5, "explanation": "Detailed rubric explanation on 1-5 scale" },
      "structure": { "score": 1-5, "explanation": "Detailed rubric explanation on 1-5 scale" },
      "topicRelevance": { "score": 1-5, "explanation": "Detailed rubric explanation on 1-5 scale" },
      "reasoning": { "score": 1-5, "explanation": "Detailed rubric explanation on 1-5 scale" },
      "evidenceAndExamples": { "score": 1-5, "explanation": "Detailed rubric explanation on 1-5 scale" },
      "overall": { "score": 1-5, "explanation": "Composite holistic assessment on 1-5 scale" }
    },
    "actionPlan": [
      "Actionable recommendation 1 for next practice session",
      "Actionable recommendation 2 for next practice session",
      "Actionable recommendation 3 for next practice session"
    ]
  }
}

Important Instructions:
- Do NOT invent claims the user did not make.
- Score each dimension strictly between 1 (Novice / Fragmentary) and 5 (Masterful / Exhaustive).
- Categories for accuracy claims must strictly be one of: "demonstrably_incorrect", "requires_evidence", "debatable_interpretation", "unverified".
- Produce valid JSON without markdown wrapping.`;
}

/**
 * Extracts and parses JSON from Gemini's response text.
 */
function parseGeminiJson(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt regex extraction of first outer { ... } if preamble was included
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`Failed to parse Gemini response as JSON: ${err.message}`);
  }
}

/**
 * Transcribes audio and generates comprehensive 9-section diagnostic analysis.
 *
 * @param {Object} params
 * @param {Buffer} params.audioBuffer - Raw binary audio recorded by client
 * @param {string} params.mimeType - Audio mime type (e.g. 'audio/webm', 'audio/wav', 'audio/ogg')
 * @param {string} params.topicTitle - Title of the topic assigned
 * @param {string} [params.topicDescription] - Description of topic
 * @returns {Promise<{ transcript: string, analysis: Object }>}
 */
async function transcribeAndAnalyzeAudio({ audioBuffer, mimeType, topicTitle, topicDescription }) {
  if (mockHandler) {
    return mockHandler({ audioBuffer, mimeType, topicTitle, topicDescription });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  if (!audioBuffer || !audioBuffer.length) {
    throw new Error('Audio data is required for speech analysis');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildAnalysisPrompt(topicTitle, topicDescription);
  const base64Audio = audioBuffer.toString('base64');

  // Standardize audio mimeType for Gemini if needed
  let cleanMimeType = mimeType ? mimeType.split(';')[0].trim().toLowerCase() : 'audio/webm';
  if (cleanMimeType === 'audio/webm' || cleanMimeType === 'audio/x-matroska') {
    cleanMimeType = 'audio/webm';
  } else if (cleanMimeType === 'audio/mp4' || cleanMimeType === 'audio/m4a') {
    cleanMimeType = 'audio/mp4';
  } else if (cleanMimeType === 'audio/wav' || cleanMimeType === 'audio/x-wav') {
    cleanMimeType = 'audio/wav';
  } else if (cleanMimeType === 'audio/ogg' || cleanMimeType === 'audio/opus') {
    cleanMimeType = 'audio/ogg';
  }

  let audioPart;
  let uploadedFile = null;

  try {
    if (audioBuffer.length > 20 * 1024 * 1024) {
      // Use Google Gen AI Files API for audio > 20MB
      const tempUploadDir = path.join(__dirname, '../../uploads/temp');
      if (!fs.existsSync(tempUploadDir)) {
        fs.mkdirSync(tempUploadDir, { recursive: true });
      }
      const tempPath = path.join(tempUploadDir, `gemini-large-audio-${Date.now()}.bin`);
      await fs.promises.writeFile(tempPath, audioBuffer);

      try {
        uploadedFile = await ai.files.upload({
          file: tempPath,
          mimeType: cleanMimeType,
        });
        audioPart = {
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: uploadedFile.mimeType || cleanMimeType,
          },
        };
      } finally {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
    } else {
      audioPart = {
        inlineData: {
          mimeType: cleanMimeType,
          data: base64Audio,
        },
      };
    }

    const response = await executeWithRetryAndFallback(
      'Gemini Audio Speech Analysis',
      (modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: [
            {
              role: 'user',
              parts: [
                audioPart,
                {
                  text: prompt,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        })
    );

    const responseText = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!responseText) {
      throw new Error('Received empty response from Gemini Speech API');
    }

    const parsedJson = parseGeminiJson(responseText);
    return validateAndNormalizeAnalysis(parsedJson);
  } catch (error) {
    throw new Error(`Gemini Speech Analysis failed: ${sanitizeErrorMessage(error.message)}`);
  } finally {
    if (uploadedFile) {
      await ai.files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
}

/**
 * Analyzes an existing transcript text using the reasoning model.
 *
 * @param {Object} params
 * @param {string} params.transcript - Text transcript of user speech
 * @param {string} params.topicTitle - Title of topic
 * @param {string} [params.topicDescription] - Description of topic
 * @returns {Promise<{ transcript: string, analysis: Object }>}
 */
async function analyzeTranscript({ transcript, topicTitle, topicDescription }) {
  if (mockHandler) {
    return mockHandler({ transcript, topicTitle, topicDescription });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  if (!transcript || !transcript.trim()) {
    throw new Error('Transcript text is required for analysis');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `${buildAnalysisPrompt(topicTitle, topicDescription)}\n\nHere is the scholar's transcript:\n"""\n${transcript}\n"""`;

  try {
    const response = await executeWithRetryAndFallback(
      'Gemini Transcript Analysis',
      (modelToUse) =>
        ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        })
    );

    const responseText = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!responseText) {
      throw new Error('Received empty response from Gemini API');
    }

    const parsedJson = parseGeminiJson(responseText);
    // Ensure original transcript is retained if not returned
    if (!parsedJson.transcript) {
      parsedJson.transcript = transcript;
    }
    return validateAndNormalizeAnalysis(parsedJson);
  } catch (error) {
    throw new Error(`Gemini Transcript Analysis failed: ${sanitizeErrorMessage(error.message)}`);
  }
}

/**
 * Test utilities to hook mock responses in automated test suites
 */
function __setMockHandler(handler) {
  mockHandler = handler;
}

function __resetMockHandler() {
  mockHandler = null;
}

module.exports = {
  transcribeAndAnalyzeAudio,
  analyzeTranscript,
  validateAndNormalizeAnalysis,
  executeWithRetry,
  executeWithRetryAndFallback,
  isTransientError,
  parseRetryAfterMs,
  sanitizeErrorMessage,
  __setMockHandler,
  __resetMockHandler,
};

