import './CuriosityPrompt.css'

/**
 * CuriosityPrompt renders an inquiry callout prompting users to reflect
 * on empirical evidence, hypotheses, and epistemological questions.
 */
export function CuriosityPrompt({ prompt, questions = [] }) {
  if (!prompt && questions.length === 0) return null

  return (
    <div className="curiosity-prompt">
      <div className="curiosity-prompt__badge">Curiosity & Evidence Lens</div>
      {prompt && <h4 className="curiosity-prompt__headline">"{prompt}"</h4>}
      {questions.length > 0 && (
        <div className="curiosity-prompt__questions">
          <span className="curiosity-prompt__subtitle">Key Epistemic Questions:</span>
          <ul>
            {questions.map((q, idx) => (
              <li key={idx}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
