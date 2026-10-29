const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS and load .env
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config({ path: path.join(__dirname, '../.env') });

const Topic = require('../src/models/Topic');
const ResearchSource = require('../src/models/ResearchSource');

const SEED_TOPICS = [
  {
    title: 'Cognitive Biases in AI Model Interpretation',
    slug: 'cognitive-biases-ai',
    category: 'Psychology',
    description:
      'When researchers interpret AI outputs, cognitive heuristics like confirmation bias and automation bias significantly alter their judgment. This module explores how to systematically detect and counter these psychological tendencies when evaluating model evidence.',
    isActive: true,
    sources: [
      {
        title: 'The Automation Bias in Clinical Decision Support: Cognitive Heuristics and Errors',
        url: 'https://informatics.bmj.com/',
        publisher: 'BMJ Health & Care Informatics',
        summary:
          'Investigates how clinicians erroneously defer to algorithmic diagnostic outputs even when physical counter-evidence is readily apparent.',
        sourceType: 'research_paper',
        isVerified: false,
      },
      {
        title: 'Confirmation Bias: A Ubiquitous Phenomenon in Many Guises',
        url: 'https://journals.sagepub.com/home/rgp',
        publisher: 'Review of General Psychology (APA)',
        summary:
          'Seminal review analyzing human cognitive tendencies to search for, interpret, and recall evidence in ways confirming pre-existing hypotheses.',
        sourceType: 'research_paper',
        isVerified: false,
      },
      {
        title: 'Human-Centered Explainability and Cognitive Load in Algorithmic Auditing',
        url: 'https://facctconference.org/',
        publisher: 'ACM Conference on Fairness, Accountability, and Transparency (FAccT)',
        summary:
          'Empirical trial evaluating how interface design and prompt structure reduce reviewer fatigue and confirmation bias during red-teaming audits.',
        sourceType: 'research_paper',
        isVerified: false,
      },
    ],
  },
  {
    title: 'Paradigm Shifts and Scientific Revolutions',
    slug: 'history-scientific-revolutions',
    category: 'History',
    description:
      'Scientific progress does not accumulate in a simple linear progression. Historical analysis reveals long periods of normal science punctuated by crises and revolutionary paradigm shifts that fundamentally alter scientific reality.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Quantum Superposition and Information Theory',
    slug: 'quantum-computing-foundations',
    category: 'Science',
    description:
      'A deep exploration of how quantum mechanical phenomena challenge classical computing paradigms. Review the experimental evidence behind quantum entanglement and quantum teleportation protocols.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Evidence Synthesis in Large Language Models',
    slug: 'neural-evidence-synthesis',
    category: 'Technology',
    description:
      'Evidence synthesis requires weighing empirical validity against sample size, methodology, and peer review status. Explore how transformer architectures parse citation chains and reconcile divergent claims.',
    isActive: true,
    sources: [
      {
        title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
        url: 'https://arxiv.org/abs/2005.11401',
        publisher: 'NeurIPS Proceedings / arXiv',
        summary:
          'Foundational framework demonstrating how parametric neural memory combines with non-parametric dense vector indices for factual consistency.',
        sourceType: 'research_paper',
        isVerified: false,
      },
      {
        title: 'Measuring Hallucinations in Neural Multi-Document Summarization',
        url: 'https://aclanthology.org/',
        publisher: 'Association for Computational Linguistics (ACL)',
        summary:
          'Benchmark study proposing factual consistency metrics to systematically detect fabricated scientific citations in generated reviews.',
        sourceType: 'research_paper',
        isVerified: false,
      },
    ],
  },
  {
    title: 'Epistemic Humility and the Scientific Method',
    slug: 'epistemic-humility-in-science',
    category: 'Philosophy',
    description:
      'Curiosity thrives when we understand the boundaries of what is known. This topic covers the philosophical roots of scientific skepticism, Karl Popper’s falsification criterion, and modern challenges in reproducible research.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Neuroaesthetics and the Perception of Sublime Form',
    slug: 'aesthetics-perception-art',
    category: 'Art',
    description:
      'Neuroaesthetics bridges artistic intuition and cognitive neuroscience, investigating why human brains across cultures consistently find beauty in symmetry, fractal geometry, and tension-release dynamics.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Heuristics, Collective Decisions & Social Choice',
    slug: 'heuristics-decision-making',
    category: 'Sociology',
    description:
      'Sociological and behavioral research empirically demonstrates how social norms, framing effects, and collective information cascades shape real-world institutional policy and voting dynamics.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Emergence, Non-Linear Dynamics & Natural Ecosystems',
    slug: 'emergence-chaos-theory',
    category: 'Nature',
    description:
      'From cellular automata and murmuration flocking to mycelial forest networks and weather chaos, natural adaptive systems defy linear modeling. Study feedback loops, strange attractors, and phase transitions.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Bayesian Updating and Probabilistic Epistemology',
    slug: 'bayesian-reasoning-evidence',
    category: 'Curious',
    description:
      'Curious minds treat belief not as dogma, but as a probability distribution continually updated in response to new evidence. Explore Bayes theorem, base-rate neglect, and epistemic curiosity.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Linguistic Relativity & Narrative Architecture',
    slug: 'linguistic-relativity-thought',
    category: 'Literature',
    description:
      'Explore the interplay between literary prose, spatial metaphors, and cognitive processing. Study how narrative viewpoint and linguistic structures shape moral perception and empathetic resonance.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Sleep, Memory Consolidation, and Learning',
    slug: 'sleep-memory-consolidation-learning',
    category: 'Psychology',
    description:
      'Explore how sleep supports memory consolidation, skill learning, and emotional regulation, and how researchers measure these effects across different sleep stages.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Framing Effect in Risk Decisions',
    slug: 'framing-effect-risk-decisions',
    category: 'Psychology',
    description:
      'Examine how equivalent gains and losses can lead to different choices, and what decision experiments reveal about framing, context, and perceived risk.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Trade Networks of the Ancient Silk Road',
    slug: 'trade-networks-ancient-silk-road',
    category: 'History',
    description:
      'Trace how routes across Asia connected merchants and cities, and consider the archaeological evidence for the exchange of goods, technologies, and ideas.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Printing Press and the Spread of Scientific Ideas',
    slug: 'printing-press-spread-scientific-ideas',
    category: 'History',
    description:
      'Investigate how print changed the circulation of scientific arguments, diagrams, and observations across early modern Europe.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Search for Dark Matter',
    slug: 'search-for-dark-matter',
    category: 'Science',
    description:
      'Compare astronomical evidence for unseen mass with the results of direct-detection experiments, and ask what observations could distinguish competing explanations.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Science of Time',
    slug: 'science-of-time',
    category: 'Science',
    description:
      'Explore how relativity, atomic clocks, and thermodynamics describe time, and where physical measurements differ from everyday intuition.',
    isActive: true,
    sources: [],
  },
  {
    title: 'How Neural Networks Learn',
    slug: 'how-neural-networks-learn',
    category: 'Technology',
    description:
      'Follow how training data, model parameters, and optimization interact, and consider what benchmarks can and cannot tell us about learned capabilities.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Privacy-Preserving Computation with Zero-Knowledge Proofs',
    slug: 'privacy-preserving-zero-knowledge-proofs',
    category: 'Technology',
    description:
      'Examine how a prover can demonstrate that a statement is valid without disclosing the underlying information, and where these protocols are useful.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Problem of Induction',
    slug: 'problem-of-induction',
    category: 'Philosophy',
    description:
      'Consider why past observations do not logically guarantee future outcomes, and how philosophers and scientists respond to this challenge in forming general laws.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Personal Identity and Memory',
    slug: 'personal-identity-and-memory',
    category: 'Philosophy',
    description:
      'Compare memory-based accounts of personal identity with bodily and psychological-continuity views, and test where each account faces difficult cases.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Perspective and the Invention of Linear Space',
    slug: 'perspective-invention-linear-space',
    category: 'Art',
    description:
      'Explore how linear perspective organizes visual space, and how artists have used or challenged its assumptions about viewpoint and representation.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Symmetry, Fractals, and Visual Preference',
    slug: 'symmetry-fractals-visual-preference',
    category: 'Art',
    description:
      'Discuss how experiments in perception study preferences for symmetry and fractal patterns, and why visual appeal may vary across context and culture.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Collective Action and Public Goods',
    slug: 'collective-action-public-goods',
    category: 'Sociology',
    description:
      'Analyze why groups may struggle to provide shared benefits, and how trust, incentives, and institutions influence cooperation.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Social Networks and the Spread of Misinformation',
    slug: 'social-networks-spread-misinformation',
    category: 'Sociology',
    description:
      'Examine how network structure, repeated exposure, and social trust affect the spread of inaccurate claims and the reach of corrections.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Mycorrhizal Networks in Forest Ecosystems',
    slug: 'mycorrhizal-networks-forest-ecosystems',
    category: 'Nature',
    description:
      'Review evidence about fungal-root partnerships, nutrient exchange, and the limits of claims that forests communicate through a single shared network.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Cooperation and Competition in Ecosystems',
    slug: 'cooperation-competition-ecosystems',
    category: 'Nature',
    description:
      'Explore how species interactions shift between cooperation and competition as resources and environmental conditions change.',
    isActive: true,
    sources: [],
  },
  {
    title: 'The Fermi Paradox and the Search for Life',
    slug: 'fermi-paradox-search-for-life',
    category: 'Curious',
    description:
      'Compare possible explanations for the apparent gap between the likelihood of extraterrestrial life and the lack of confirmed observations.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Why Time Feels Faster as We Age',
    slug: 'why-time-feels-faster-with-age',
    category: 'Curious',
    description:
      'Discuss psychological accounts of changing time perception, including memory density, attention, and the way familiar routines shape recall.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Unreliable Narrators and Reader Trust',
    slug: 'unreliable-narrators-reader-trust',
    category: 'Literature',
    description:
      'Explore how gaps between a narrator’s account and the story’s evidence invite readers to revise their interpretations and judge credibility.',
    isActive: true,
    sources: [],
  },
  {
    title: 'Metaphor and Conceptual Thought',
    slug: 'metaphor-and-conceptual-thought',
    category: 'Literature',
    description:
      'Examine how metaphor structures abstract ideas in language, and what linguistic and cognitive research can establish about its influence on reasoning.',
    isActive: true,
    sources: [],
  },
];

async function seedTopics() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI is missing in Backend/.env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.');

    let createdTopics = 0;
    let existingTopics = 0;
    let createdSources = 0;

    for (const item of SEED_TOPICS) {
      let topic = await Topic.findOne({ slug: item.slug });

      if (!topic) {
        topic = await Topic.create({
          title: item.title,
          slug: item.slug,
          category: item.category,
          description: item.description,
          isActive: item.isActive,
        });
        createdTopics++;
        console.log(`[+] Created topic: ${item.title} (${item.category})`);
      } else {
        existingTopics++;
      }

      // Seed any associated unreviewed research sources idempotently
      if (item.sources && item.sources.length > 0) {
        for (const src of item.sources) {
          const existingSource = await ResearchSource.findOne({
            topic: topic._id,
            url: src.url,
          });

          if (!existingSource) {
            await ResearchSource.create({
              topic: topic._id,
              title: src.title,
              url: src.url,
              publisher: src.publisher,
              summary: src.summary,
              sourceType: src.sourceType,
              isVerified: src.isVerified,
            });
            createdSources++;
          }
        }
      }
    }

    console.log('\n--- Seed Summary ---');
    console.log(`Topics created: ${createdTopics}`);
    console.log(`Topics preserved: ${existingTopics}`);
    console.log(`Research sources added: ${createdSources}`);
    console.log('Seeding completed cleanly.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

if (require.main === module) {
  seedTopics();
}

module.exports = {
  seedTopics,
  SEED_TOPICS,
};
