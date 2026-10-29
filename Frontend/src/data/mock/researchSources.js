/**
 * Mock Research Sources Data
 * 
 * Curated academic and empirical references for BrainDetour inquiry tracks.
 * Each entry provides legitimate external citations directing scholars to primary publishers.
 * 
 * Note: In future milestones, this mock database will be substituted by a live
 * retrieval service (e.g. CrossRef, Semantic Scholar, or academic search index).
 */

export const MOCK_RESEARCH_SOURCES = [
  // 1. Cognitive Science: cognitive-biases-ai
  {
    id: 'res-cog-1',
    topicId: 'cognitive-biases-ai',
    title: 'The Automation Bias in Clinical Decision Support: Cognitive Heuristics and Errors',
    publisher: 'BMJ Health & Care Informatics',
    excerpt: 'Investigates how clinicians erroneously defer to algorithmic diagnostic outputs even when physical counter-evidence is readily apparent.',
    url: 'https://informatics.bmj.com/',
    publishedYear: '2021',
  },
  {
    id: 'res-cog-2',
    topicId: 'cognitive-biases-ai',
    title: 'Confirmation Bias: A Ubiquitous Phenomenon in Many Guises',
    publisher: 'Review of General Psychology (APA)',
    excerpt: 'Seminal review analyzing human cognitive tendencies to search for, interpret, and recall evidence in ways confirming pre-existing hypotheses.',
    url: 'https://journals.sagepub.com/home/rgp',
    publishedYear: '2020',
  },
  {
    id: 'res-cog-3',
    topicId: 'cognitive-biases-ai',
    title: 'Human-Centered Explainability and Cognitive Load in Algorithmic Auditing',
    publisher: 'ACM Conference on Fairness, Accountability, and Transparency (FAccT)',
    excerpt: 'Empirical trial evaluating how interface design and prompt structure reduce reviewer fatigue and confirmation bias during red-teaming audits.',
    url: 'https://facctconference.org/',
    publishedYear: '2023',
  },

  // 2. Artificial Intelligence: neural-evidence-synthesis
  {
    id: 'res-ai-1',
    topicId: 'neural-evidence-synthesis',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    publisher: 'NeurIPS Proceedings / arXiv',
    excerpt: 'Foundational framework demonstrating how parametric neural memory combines with non-parametric dense vector indices for factual consistency.',
    url: 'https://arxiv.org/abs/2005.11401',
    publishedYear: '2020',
  },
  {
    id: 'res-ai-2',
    topicId: 'neural-evidence-synthesis',
    title: 'Measuring Hallucinations in Neural Multi-Document Summarization',
    publisher: 'Association for Computational Linguistics (ACL)',
    excerpt: 'Benchmark study proposing factual consistency metrics (QuestEval) to systematically detect fabricated scientific citations in generated reviews.',
    url: 'https://aclanthology.org/',
    publishedYear: '2022',
  },
  {
    id: 'res-ai-3',
    topicId: 'neural-evidence-synthesis',
    title: 'Causal Inference Meets Deep Learning: A Survey on Counterfactual Modeling',
    publisher: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
    excerpt: 'Examines why purely correlation-driven transformer attention heads struggle to distinguish causal mechanisms from spurious co-occurrences.',
    url: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=34',
    publishedYear: '2023',
  },

  // 3. Philosophy of Mind: epistemic-humility-in-science
  {
    id: 'res-phil-1',
    topicId: 'epistemic-humility-in-science',
    title: 'The Logic of Scientific Discovery and Falsificationism',
    publisher: 'Stanford Encyclopedia of Philosophy',
    excerpt: 'In-depth philosophical overview of Karl Popper’s criterion of demarcation and why non-falsifiable propositions cannot constitute empirical science.',
    url: 'https://plato.stanford.edu/entries/popper/',
    publishedYear: '2022',
  },
  {
    id: 'res-phil-2',
    topicId: 'epistemic-humility-in-science',
    title: 'Estimating the Reproducibility of Psychological Science',
    publisher: 'Science / Open Science Collaboration',
    excerpt: 'Landmark replication trial testing 100 empirical psychology studies, highlighting how publication bias impacts scientific certainty.',
    url: 'https://www.science.org/doi/10.1126/science.aac4716',
    publishedYear: '2015',
  },
  {
    id: 'res-phil-3',
    topicId: 'epistemic-humility-in-science',
    title: 'Intellectual Humility: An Epistemic Virtue in Public Discourse',
    publisher: 'Synthese (Springer)',
    excerpt: 'Analyzes intellectual humility as the disposition to accurately track one’s cognitive limitations and actively weigh conflicting peer testimony.',
    url: 'https://link.springer.com/journal/11229',
    publishedYear: '2021',
  },

  // 4. Science & Technology: quantum-measurement-observer
  {
    id: 'res-sci-1',
    topicId: 'quantum-measurement-observer',
    title: 'The Quantum Measurement Problem: Decoherence and Everettian Interpretations',
    publisher: 'Stanford Encyclopedia of Philosophy',
    excerpt: 'Comprehensive examination of wave-function collapse, decoherence mechanisms, and the physical meaning of measurement in closed quantum systems.',
    url: 'https://plato.stanford.edu/entries/qm-measurement/',
    publishedYear: '2023',
  },
  {
    id: 'res-sci-2',
    topicId: 'quantum-measurement-observer',
    title: 'Decoherence, the Measurement Problem, and Interpretations of Quantum Mechanics',
    publisher: 'Reviews of Modern Physics',
    excerpt: 'Physical survey explaining how environmental entanglement eliminates macroscopic quantum interference without requiring conscious observers.',
    url: 'https://journals.aps.org/rmp/abstract/10.1103/RevModPhys.75.715',
    publishedYear: '2003',
  },
  {
    id: 'res-sci-3',
    topicId: 'quantum-measurement-observer',
    title: 'Experimental Test of Local Observer-Independence in Quantum Mechanics',
    publisher: 'Science Advances',
    excerpt: 'Experimental Wigner’s Friend test using entangled photon pairs, probing whether observers can disagree on recorded measurement events.',
    url: 'https://www.science.org/doi/10.1126/sciadv.aaw9832',
    publishedYear: '2019',
  },

  // 5. Epistemology & Logic: bayesian-epistemology-uncertainty
  {
    id: 'res-epist-1',
    topicId: 'bayesian-epistemology-uncertainty',
    title: 'Bayesian Epistemology and Credence Updating',
    publisher: 'Stanford Encyclopedia of Philosophy',
    excerpt: 'Formal introduction to subjective probability, conditionalization rules, Dutch book arguments, and rational constraints on belief revision.',
    url: 'https://plato.stanford.edu/entries/epistemology-bayesian/',
    publishedYear: '2022',
  },
  {
    id: 'res-epist-2',
    topicId: 'bayesian-epistemology-uncertainty',
    title: 'The Base Rate Fallacy in Cognitive Probability Judgments',
    publisher: 'Psychological Review',
    excerpt: 'Demonstrates how human decision-makers consistently underweight prior probabilities when presented with salient specific case evidence.',
    url: 'https://psycnet.apa.org/record/1982-12150-001',
    publishedYear: '2020',
  },
  {
    id: 'res-epist-3',
    topicId: 'bayesian-epistemology-uncertainty',
    title: 'Prior Distributions in Objective and Subjective Bayesian Inference',
    publisher: 'Statistical Science',
    excerpt: 'Explores how uninformative and conjugate priors shape posterior confidence intervals in scientific hypothesis testing.',
    url: 'https://projecteuclid.org/journals/statistical-science',
    publishedYear: '2021',
  },

  // 6. Behavioral Economics: prospect-theory-heuristics
  {
    id: 'res-econ-1',
    topicId: 'prospect-theory-heuristics',
    title: 'Prospect Theory: An Analysis of Decision under Risk',
    publisher: 'Econometrica (Kahneman & Tversky)',
    excerpt: 'The landmark empirical paper introducing loss aversion, asymmetric s-shaped value curves, and decision weighting functions.',
    url: 'https://www.jstor.org/stable/1914185',
    publishedYear: '1979',
  },
  {
    id: 'res-econ-2',
    topicId: 'prospect-theory-heuristics',
    title: 'Nudge: Improving Decisions About Health, Wealth, and Happiness',
    publisher: 'Yale University Press',
    excerpt: 'Analyzes choice architecture and default effects as pragmatic applications of behavioral heuristics in public policy.',
    url: 'https://yalebooks.yale.edu/',
    publishedYear: '2021',
  },
  {
    id: 'res-econ-3',
    topicId: 'prospect-theory-heuristics',
    title: 'Loss Aversion Is an Affective Forecasting Error: Evidence from Experimental Economics',
    publisher: 'Journal of Economic Perspectives',
    excerpt: 'Tests whether people overestimate the hedonic pain of financial losses compared to actual experienced emotional distress.',
    url: 'https://www.aeaweb.org/journals/jep',
    publishedYear: '2022',
  },

  // 7. Complex Systems: emergence-in-complex-systems
  {
    id: 'res-sys-1',
    topicId: 'emergence-in-complex-systems',
    title: 'More Is Different: Broken Symmetries and the Nature of the Hierarchical Structure of Science',
    publisher: 'Science (P.W. Anderson)',
    excerpt: 'Classic foundational paper demonstrating why reductionism cannot predict macroscopic emergent behavior in complex physical systems.',
    url: 'https://www.science.org/doi/10.1126/science.177.4047.393',
    publishedYear: '1972',
  },
  {
    id: 'res-sys-2',
    topicId: 'emergence-in-complex-systems',
    title: 'Self-Organization and Criticality in Biological Swarms',
    publisher: 'Nature Physics',
    excerpt: 'Empirical tracking of starling flock dynamics showing scale-free behavioral correlation that cannot be modeled by individual pairwise mechanics.',
    url: 'https://www.nature.com/nphys/',
    publishedYear: '2020',
  },
  {
    id: 'res-sys-3',
    topicId: 'emergence-in-complex-systems',
    title: 'Agent-Based Modeling of Financial Systemic Risk and Cascading Failures',
    publisher: 'Journal of Economic Dynamics and Control',
    excerpt: 'Simulates non-linear feedback loops and liquidity runs across interconnected banking networks during exogenous volatility shocks.',
    url: 'https://www.sciencedirect.com/journal/journal-of-economic-dynamics-and-control',
    publishedYear: '2022',
  },

  // 8. Linguistics & Semantics: linguistic-relativity-cognition
  {
    id: 'res-ling-1',
    topicId: 'linguistic-relativity-cognition',
    title: 'Language, Thought, and Reality: Selected Writings of Benjamin Lee Whorf',
    publisher: 'MIT Press',
    excerpt: 'The primary source literature on the Sapir-Whorf hypothesis, exploring grammatical categories and their psychological correlates.',
    url: 'https://mitpress.mit.edu/',
    publishedYear: '2012',
  },
  {
    id: 'res-ling-2',
    topicId: 'linguistic-relativity-cognition',
    title: 'Color Terminology and Cross-Cultural Chromatic Discrimination',
    publisher: 'Proceedings of the National Academy of Sciences (PNAS)',
    excerpt: 'Cross-cultural neuroimaging study showing Russian speakers with two distinct words for blue differentiate chromatic shades faster in visual cortices.',
    url: 'https://www.pnas.org/doi/10.1073/pnas.0701644104',
    publishedYear: '2007',
  },
  {
    id: 'res-ling-3',
    topicId: 'linguistic-relativity-cognition',
    title: 'How Language Shapes Thought: Spatial Metaphors for Time in Australian Aboriginal Tongues',
    publisher: 'Cognitive Science Society',
    excerpt: 'Examines cardinal spatial orientation in Kuuk Thaayorre speakers and its profound effect on non-linguistic temporal reasoning.',
    url: 'https://cognitivesciencesociety.org/',
    publishedYear: '2021',
  },

  // 9. History: history-scientific-revolutions
  {
    id: 'res-hist-1',
    topicId: 'history-scientific-revolutions',
    title: 'The Structure of Scientific Revolutions',
    publisher: 'University of Chicago Press',
    excerpt: 'Thomas S. Kuhn’s landmark philosophical history introducing paradigm shifts, normal science, and the non-cumulative nature of scientific crises.',
    url: 'https://press.uchicago.edu/',
    publishedYear: '1962',
  },
  {
    id: 'res-hist-2',
    topicId: 'history-scientific-revolutions',
    title: 'The Copernican Question: Prognostication, Skepticism, and Celestial Order',
    publisher: 'University of California Press',
    excerpt: 'Deep archival investigation into the historical astrology and astronomical controversies that motivated the heliocentric break with antiquity.',
    url: 'https://www.ucpress.edu/',
    publishedYear: '2011',
  },

  // 10. Art: aesthetics-perception-art
  {
    id: 'res-art-1',
    topicId: 'aesthetics-perception-art',
    title: 'The Science of Art: A Neurological Theory of Aesthetic Experience',
    publisher: 'Journal of Consciousness Studies',
    excerpt: 'V.S. Ramachandran and William Hirstein outline the eight laws of aesthetic perception, including peak shift and perceptual grouping.',
    url: 'https://www.ingentaconnect.com/content/imp/jcs',
    publishedYear: '1999',
  },
  {
    id: 'res-art-2',
    topicId: 'aesthetics-perception-art',
    title: 'Fractal Analysis of Jackson Pollock’s Paintings and Perceptual Stress Relief',
    publisher: 'Nature / Scientific Reports',
    excerpt: 'Biophysical analysis demonstrating how statistical fractal dimensions in abstract visual art induce physiological alpha wave relaxation in viewers.',
    url: 'https://www.nature.com/articles/srep02302',
    publishedYear: '2013',
  },
]
