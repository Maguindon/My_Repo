import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  authenticateModel,
  callAIModel,
  getSetupInstructions,
  PROVIDER_CONFIG
} from './api/aiServices';

const countWords = (text) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
};

const countSentences = (text) => {
  if (!text.trim()) {
    return 0;
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
};

const createChecklistItem = (label, satisfied, tip) => ({
  label,
  status: satisfied ? 'complete' : 'missing',
  tip
});

const formatConversationForPrompt = (conversation = []) =>
  conversation
    .filter((message) => message?.text)
    .map((message) => `${message.sender === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n\n');

const buildPromptOptimization = (promptText) => {
  const trimmed = promptText.trim();
  if (!trimmed) {
    return null;
  }

  const wordCount = countWords(trimmed);
  const sentenceCount = countSentences(trimmed);
  const averageSentenceLength = sentenceCount ? wordCount / sentenceCount : wordCount;
  const estimatedReadingTime = Math.max(1, Math.round(wordCount / 150))
    .toString();

  const hasGoal = /(goal|objective|task|help|need|create|write|build|draft|plan)/i.test(trimmed);
  const hasContext = /(context|background|currently|existing|scenario|situation|project|because|since)/i.test(trimmed) || wordCount > 50;
  const hasConstraints = /(must|should|length|limit|deadline|timeframe|budget|max|min|constraint|avoid|only)/i.test(trimmed);
  const hasAudience = /(audience|user|customer|client|stakeholder|team|executive|students|developers)/i.test(trimmed);
  const hasFormat = /(format|table|bullet|list|json|markdown|steps|outline|structure|deliverable|provide)/i.test(trimmed);
  const hasTone = /(tone|style|voice|friendly|formal|concise|detailed)/i.test(trimmed);
  const hasExamples = /(example|sample|for example|e\.g\.|illustrate)/i.test(trimmed);
  const hasQuestions = /\?/g.test(trimmed);

  const strengths = [];
  const suggestions = [];

  if (hasGoal) {
    strengths.push('Clearly communicates the objective.');
  } else {
    suggestions.push('Spell out the primary goal so the assistant knows what success looks like.');
  }

  if (hasConstraints) {
    strengths.push('Includes constraints or guardrails.');
  } else {
    suggestions.push('Add constraints such as tone, length, deadlines, or must-have details.');
  }

  if (hasAudience) {
    strengths.push('Mentions the intended audience.');
  } else {
    suggestions.push('Call out who will consume the answer so it can be tailored appropriately.');
  }

  if (hasFormat) {
    strengths.push('Provides guidance on the response format.');
  } else {
    suggestions.push('Request an explicit output format (bullet list, table, JSON, etc.).');
  }

  if (hasContext) {
    strengths.push('Includes useful background context.');
  } else {
    suggestions.push('Add short background context or constraints the assistant should respect.');
  }

  if (hasExamples) {
    strengths.push('Supplies examples to anchor the response.');
  } else {
    suggestions.push('Provide an example answer or structure if you want the assistant to mirror it.');
  }

  if (averageSentenceLength > 28) {
    suggestions.push('Break longer sentences into smaller steps to improve clarity.');
  } else if (averageSentenceLength >= 14) {
    strengths.push('Uses readable sentence lengths.');
  }

  if (!hasQuestions) {
    suggestions.push('List clarifying questions you still have so the assistant can ask before answering.');
  }

  const checklist = [
    createChecklistItem('Goal defined', hasGoal, 'Add a line like "Goal:" or "Objective:".'),
    createChecklistItem('Relevant context shared', hasContext, 'Mention background, existing work, or constraints.'),
    createChecklistItem('Audience identified', hasAudience, 'State who the output is for (customer, exec team, etc.).'),
    createChecklistItem('Output format specified', hasFormat, 'Say how the response should be structured.'),
    createChecklistItem('Constraints documented', hasConstraints, 'Call out limits, deadlines, or metrics that matter.'),
    createChecklistItem('Tone or style noted', hasTone, 'Let the assistant know the tone or level of formality.'),
    createChecklistItem('Examples provided', hasExamples, 'Give an example to anchor the assistant if helpful.'),
    createChecklistItem('Clarifying questions listed', hasQuestions, 'Proactively list questions the assistant should answer.')
  ];

  const missingItems = checklist.filter((item) => item.status === 'missing');

  const optimizedPromptSections = [
    'You are an expert assistant. Respond with clear structure, assumptions, and next steps.',
    '',
    '### Goal',
    hasGoal ? trimmed : `Help with the following request: ${trimmed}`,
    '',
    '### Before You Answer',
    hasContext
      ? '- Use the context and constraints provided.'
      : '- Ask for any missing context or constraints before solving.',
    hasAudience
      ? '- Tailor the response to the stated audience.'
      : '- Clarify who the audience is before finalizing the answer.',
    hasTone
      ? '- Match the tone or style requested.'
      : '- Confirm the desired tone (formal, casual, concise, etc.).',
    '',
    '### Response Expectations',
    '- Start with a concise summary of your recommendation.',
    '- Provide a structured breakdown with bullet points or tables when useful.',
    '- Call out assumptions, open questions, and suggested next steps.'
  ];

  if (missingItems.length > 0) {
    optimizedPromptSections.push('', '### Ask Before Completing', ...missingItems.map((item) => `- ${item.tip}`));
  }

  optimizedPromptSections.push('', '### Original Request', trimmed);

  const followUpQuestions = missingItems.slice(0, 3).map((item) => item.tip.replace(/\.$/, '?'));

  return {
    optimizedPrompt: optimizedPromptSections.join('\n'),
    strengths: [...new Set(strengths)],
    suggestions: [...new Set(suggestions)],
    checklist,
    metrics: {
      wordCount,
      sentenceCount,
      averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
      estimatedReadingTime
    },
    followUpQuestions
  };
};

const LIBRARY_STORAGE_KEY = 'better-ai-prompt-library';

const DEFAULT_PROMPT_LIBRARY = [
  {
    id: 'prompt-product-kickoff',
    title: 'Product Kickoff Summary',
    description: 'Recap goals, stakeholders, risks, and approvals for a product initiative.',
    content: `You are a product lead preparing a kickoff summary for cross-functional stakeholders.

Provide:
- Executive summary (2-3 sentences)
- Goals and success metrics
- Key stakeholders & decision owners
- Known risks or open questions
- Timeline next steps and owners

Keep it concise and actionable.`,
    tags: ['product', 'planning'],
    isDefault: true
  },
  {
    id: 'prompt-engineering-handoff',
    title: 'Engineering Handoff Checklist',
    description: 'Ensure designers and engineers capture the context before development starts.',
    content: `You are an engineering manager reviewing a new feature for development handoff.

Return a checklist that covers:
1. Business context and customer problem
2. Design assets or specs to reference
3. Edge cases to guard against
4. Analytics or logging expectations
5. Launch checklist (QA, docs, rollout plan)

Call out any missing information the team should clarify first.`,
    tags: ['engineering', 'handoff'],
    isDefault: true
  },
  {
    id: 'prompt-meeting-recap',
    title: 'Meeting Recap & Actions',
    description: 'Fast follow-up email summarising a meeting with clear owners.',
    content: `Draft a follow-up email for our latest meeting.

Include sections:
- Quick recap (2 sentences)
- Decisions locked in
- Action items with owner and due date
- Open questions or blockers

Use a friendly, professional tone.`,
    tags: ['communications', 'email'],
    isDefault: true
  }
];

const DEFAULT_GIT_COMMANDS = [
  {
    id: 'git-status',
    title: 'Check working tree status',
    description: 'See staged, unstaged, and untracked files.',
    content: 'git status',
    tags: ['git', 'workflow'],
    isDefault: true
  },
  {
    id: 'git-pull',
    title: 'Sync with remote main',
    description: 'Fetch and merge the latest changes from origin/main.',
    content: 'git pull origin main',
    tags: ['git', 'sync'],
    isDefault: true
  },
  {
    id: 'git-new-branch',
    title: 'Create and switch to a new branch',
    description: 'Start a feature branch from the current HEAD.',
    content: 'git checkout -b feature/your-branch-name',
    tags: ['git', 'branches'],
    isDefault: true
  },
  {
    id: 'git-stage-all',
    title: 'Stage all changes',
    description: 'Adds tracked and untracked files to the staging area.',
    content: 'git add .',
    tags: ['git', 'staging'],
    isDefault: true
  },
  {
    id: 'git-commit',
    title: 'Commit staged changes',
    description: 'Create a commit with a message.',
    content: "git commit -m \"Short, descriptive message\"",
    tags: ['git', 'commits'],
    isDefault: true
  },
  {
    id: 'git-push',
    title: 'Push branch to origin',
    description: 'Publish the current branch to the remote repository.',
    content: 'git push origin feature/your-branch-name',
    tags: ['git', 'sync'],
    isDefault: true
  },
  {
    id: 'git-fetch-prune',
    title: 'Fetch & clean remote tracking refs',
    description: 'Fetch latest refs and prune deleted branches.',
    content: 'git fetch --prune',
    tags: ['git', 'maintenance'],
    isDefault: true
  },
  {
    id: 'git-stash',
    title: 'Stash local changes',
    description: 'Save uncommitted changes temporarily.',
    content: 'git stash push -m "wip"',
    tags: ['git', 'staging'],
    isDefault: true
  }
];

const EMPTY_PROMPT_DRAFT = { title: '', content: '', description: '', tags: '' };
const EMPTY_COMMAND_DRAFT = { title: '', content: '', description: '', tags: '' };

const mergeLibrarySection = (defaults, stored = []) => {
  const defaultMap = new Map(
    defaults.map((item) => [item.id, { ...item, tags: Array.isArray(item.tags) ? item.tags : [] }])
  );

  const result = [...defaultMap.values()];

  stored.forEach((item) => {
    if (!item || !item.id) {
      return;
    }

    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (defaultMap.has(item.id)) {
      const existingIndex = result.findIndex((entry) => entry.id === item.id);
      if (existingIndex > -1) {
        result[existingIndex] = {
          ...result[existingIndex],
          ...item,
          tags: tags.length ? tags : result[existingIndex].tags,
          isDefault: true
        };
      }
    } else {
      result.push({ ...item, tags, isDefault: Boolean(item.isDefault) });
    }
  });

  return result;
};

const loadLibraryFromStorage = () => {
  if (typeof window === 'undefined') {
    return {
      prompts: mergeLibrarySection(DEFAULT_PROMPT_LIBRARY),
      commands: mergeLibrarySection(DEFAULT_GIT_COMMANDS)
    };
  }

  try {
    const storedValue = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!storedValue) {
      return {
        prompts: mergeLibrarySection(DEFAULT_PROMPT_LIBRARY),
        commands: mergeLibrarySection(DEFAULT_GIT_COMMANDS)
      };
    }

    const parsed = JSON.parse(storedValue);
    return {
      prompts: mergeLibrarySection(DEFAULT_PROMPT_LIBRARY, parsed?.prompts),
      commands: mergeLibrarySection(DEFAULT_GIT_COMMANDS, parsed?.commands)
    };
  } catch (error) {
    console.warn('Failed to load prompt library from storage:', error);
    return {
      prompts: mergeLibrarySection(DEFAULT_PROMPT_LIBRARY),
      commands: mergeLibrarySection(DEFAULT_GIT_COMMANDS)
    };
  }
};

function App() {
  const [prompt, setPrompt] = useState('');
  const [modelResponses, setModelResponses] = useState({});
  const [modelConversations, setModelConversations] = useState({});
  const [replyStates, setReplyStates] = useState({});
  const [replyLoading, setReplyLoading] = useState({});
  const [copyStatuses, setCopyStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-theme', 'dark');
    }

    return true;
  });
  const [managerMessage, setManagerMessage] = useState(null);
  const [isComparisonToolsOpen, setIsComparisonToolsOpen] = useState(false);

  const providerOptions = useMemo(() => Object.values(PROVIDER_CONFIG), []);

  const [models, setModels] = useState(() => [
    {
      id: 'anthropic-default',
      providerId: 'anthropic',
      name: 'Claude Sonnet',
      model: PROVIDER_CONFIG.anthropic.defaultModel,
      isActive: true,
      authenticatedAt: null,
      authError: null
    },
    {
      id: 'openai-default',
      providerId: 'openai',
      name: 'ChatGPT GPT-4',
      model: PROVIDER_CONFIG.openai.defaultModel,
      isActive: true,
      authenticatedAt: null,
      authError: null
    },
    {
      id: 'gemini-default',
      providerId: 'gemini',
      name: 'Gemini 2.5 Flash',
      model: PROVIDER_CONFIG.gemini.defaultModel,
      isActive: true,
      authenticatedAt: null,
      authError: null
    }
  ]);

  const [newModel, setNewModel] = useState({
    providerId: 'openai',
    name: '',
    model: PROVIDER_CONFIG.openai.defaultModel,
    apiKey: ''
  });

  const [library, setLibrary] = useState(() => loadLibraryFromStorage());
  const [promptDraft, setPromptDraft] = useState(() => ({ ...EMPTY_PROMPT_DRAFT }));
  const [commandDraft, setCommandDraft] = useState(() => ({ ...EMPTY_COMMAND_DRAFT }));
  const [promptDraftError, setPromptDraftError] = useState(null);
  const [commandDraftError, setCommandDraftError] = useState(null);
  const [libraryCopyStatus, setLibraryCopyStatus] = useState(null);
  const totalPrompts = library.prompts.length;
  const totalCommands = library.commands.length;
  const customPromptCount = useMemo(
    () => library.prompts.filter((item) => !item.isDefault).length,
    [library.prompts]
  );
  const customCommandCount = useMemo(
    () => library.commands.filter((item) => !item.isDefault).length,
    [library.commands]
  );
  const customEntryCount = customPromptCount + customCommandCount;

  const activeModels = useMemo(() => models.filter((model) => model.isActive), [models]);
  const [activePanel, setActivePanel] = useState('all');

  const handlePromptChange = useCallback((event) => {
    setPrompt(event.target.value);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setManagerMessage(null);

    if (!prompt.trim()) {
      return;
    }

    if (activeModels.length === 0) {
      setError('Select at least one model to run the comparison.');
      return;
    }

    setLoading(true);
    setError(null);
    setModelResponses({});
    setActivePanel('all');
    setReplyStates({});
    setReplyLoading({});
    setCopyStatuses({});

    setModelConversations(
      activeModels.reduce((acc, model) => {
        acc[model.id] = [{ sender: 'user', text: prompt }];
        return acc;
      }, {})
    );

    try {
      const results = await Promise.allSettled(
        activeModels.map((model) =>
          callAIModel({
            providerId: model.providerId,
            prompt,
            model: model.model,
            apiKey: model.apiKey
          })
        )
      );

      const nextResponses = {};
      results.forEach((result, index) => {
        const model = activeModels[index];

        if (result.status === 'fulfilled') {
          nextResponses[model.id] = result.value;
        } else {
          const message = result.reason?.message || 'Failed to get a response.';
          nextResponses[model.id] = {
            error: message,
            model: model.model
          };
        }
      });

      setModelResponses(nextResponses);
      setModelConversations((prev) => {
        const next = { ...prev };
        activeModels.forEach((model, index) => {
          const result = results[index];
          if (result.status === 'fulfilled' && result.value?.content) {
            const existingConversation = next[model.id] || [];
            next[model.id] = [
              ...existingConversation,
              { sender: 'assistant', text: result.value.content }
            ];
          }
        });
        return next;
      });
    } catch (err) {
      setError('An error occurred while fetching responses.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [showSetupInstructions, setShowSetupInstructions] = useState(false);
  const [activeTab, setActiveTab] = useState('ai-comparison');
  const [optimizerPrompt, setOptimizerPrompt] = useState('');
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [optimizerTouched, setOptimizerTouched] = useState(false);
  const [optimizerCopyStatus, setOptimizerCopyStatus] = useState(null);
  const copyStatusTimeoutRef = useRef(null);
  const libraryCopyTimeoutRef = useRef(null);
  const responseCopyTimeoutRef = useRef({});
  const isOptimizeDisabled = !optimizerPrompt.trim();


  useEffect(() => {
    return () => {
      if (copyStatusTimeoutRef.current) {
        clearTimeout(copyStatusTimeoutRef.current);
      }
      if (libraryCopyTimeoutRef.current) {
        clearTimeout(libraryCopyTimeoutRef.current);
      }
      const timeouts = responseCopyTimeoutRef.current || {};
      Object.values(timeouts).forEach((timeoutId) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
      responseCopyTimeoutRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!optimizerCopyStatus) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setOptimizerCopyStatus(null);
      copyStatusTimeoutRef.current = null;
    }, 2400);

    copyStatusTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [optimizerCopyStatus]);

  useEffect(() => {
    if (!libraryCopyStatus) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setLibraryCopyStatus(null);
      libraryCopyTimeoutRef.current = null;
    }, 2400);

    libraryCopyTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [libraryCopyStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      window.localStorage.setItem(
        LIBRARY_STORAGE_KEY,
        JSON.stringify({ prompts: library.prompts, commands: library.commands })
      );
    } catch (storageError) {
      console.warn('Unable to persist prompt library:', storageError);
    }

    return undefined;
  }, [library]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const theme = darkMode ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);

    return () => {
      document.body.removeAttribute('data-theme');
    };
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  useEffect(() => {
    if (activePanel !== 'all' && !activeModels.some((model) => model.id === activePanel)) {
      setActivePanel('all');
    }
  }, [activePanel, activeModels]);

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    setManagerMessage(null);

    if (nextTab !== 'ai-comparison') {
      setIsComparisonToolsOpen(false);

      if (showSetupInstructions) {
        setShowSetupInstructions(false);
      }
    }

  };

  const renderSectionToolButtons = () => {
    if (activeTab === 'ai-comparison') {
      const activeCount = activeModels.length;
      const totalCount = models.length;
      const buttonLabel = isComparisonToolsOpen
        ? 'Hide Model Manager'
        : totalCount > 0
        ? `Manage Models (${activeCount}/${totalCount} active)`
        : 'Manage Models (add one)';

      return (
        <button
          type="button"
          className="section-tools__button"
          onClick={() => setIsComparisonToolsOpen((prev) => !prev)}
        >
          {buttonLabel}
        </button>
      );
    }

    return (
      <button type="button" className="section-tools__button" disabled>
        Tools coming soon
      </button>
    );
  };

  const handleOptimizePrompt = (event) => {
    event.preventDefault();
    setOptimizerTouched(true);

    if (!optimizerPrompt.trim()) {
      return;
    }

    const optimization = buildPromptOptimization(optimizerPrompt);
    setOptimizerResult(optimization);
  };

  const handleOptimizerInputChange = (event) => {
    const { value } = event.target;
    setOptimizerPrompt(value);

    if (optimizerResult) {
      setOptimizerResult(null);
    }

    if (optimizerCopyStatus) {
      setOptimizerCopyStatus(null);
    }

    if (optimizerTouched) {
      setOptimizerTouched(false);
    }
  };

  const handleResetOptimizer = () => {
    setOptimizerPrompt('');
    setOptimizerResult(null);
    setOptimizerTouched(false);
    setOptimizerCopyStatus(null);
  };

  const handleCopyOptimizedPrompt = async () => {
    if (!optimizerResult?.optimizedPrompt) {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(optimizerResult.optimizedPrompt);
        setOptimizerCopyStatus('Copied to clipboard');
      } else {
        throw new Error('Clipboard not available');
      }
    } catch (copyError) {
      console.warn('Copy failed:', copyError);
      setOptimizerCopyStatus('Copy not supported in this browser');
    }
  };

  const parseTagsInput = (value) =>
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

  const handlePromptDraftChange = (field, value) => {
    setPromptDraft((prev) => ({
      ...prev,
      [field]: value
    }));

    if (promptDraftError) {
      setPromptDraftError(null);
    }
  };

  const handleCommandDraftChange = (field, value) => {
    setCommandDraft((prev) => ({
      ...prev,
      [field]: value
    }));

    if (commandDraftError) {
      setCommandDraftError(null);
    }
  };

  const handleAddPromptToLibrary = (event) => {
    event.preventDefault();
    const title = promptDraft.title.trim();
    const content = promptDraft.content.trim();

    if (!title || !content) {
      setPromptDraftError('Add a title and prompt text before saving.');
      return;
    }

    const duplicate = library.prompts.some((item) => item.title.trim().toLowerCase() === title.toLowerCase());
    if (duplicate) {
      setPromptDraftError('A prompt with this title already exists.');
      return;
    }

    const nextPrompt = {
      id: `custom-prompt-${Date.now()}`,
      title,
      description: promptDraft.description.trim(),
      content,
      tags: parseTagsInput(promptDraft.tags),
      isDefault: false
    };

    setLibrary((prev) => ({
      ...prev,
      prompts: [...prev.prompts, nextPrompt]
    }));

    setPromptDraft({ ...EMPTY_PROMPT_DRAFT });
  };

  const handleAddCommandToLibrary = (event) => {
    event.preventDefault();
    const title = commandDraft.title.trim();
    const content = commandDraft.content.trim();

    if (!title || !content) {
      setCommandDraftError('Add a label and command before saving.');
      return;
    }

    const duplicate = library.commands.some((item) => {
      return (
        item.title.trim().toLowerCase() === title.toLowerCase() ||
        item.content.trim().toLowerCase() === content.toLowerCase()
      );
    });

    if (duplicate) {
      setCommandDraftError('That command is already saved.');
      return;
    }

    const nextCommand = {
      id: `custom-command-${Date.now()}`,
      title,
      description: commandDraft.description.trim(),
      content,
      tags: parseTagsInput(commandDraft.tags),
      isDefault: false
    };

    setLibrary((prev) => ({
      ...prev,
      commands: [...prev.commands, nextCommand]
    }));

    setCommandDraft({ ...EMPTY_COMMAND_DRAFT });
  };

  const handleRemoveLibraryItem = (section, itemId) => {
    if (libraryCopyStatus?.id === itemId) {
      setLibraryCopyStatus(null);
    }

    setLibrary((prev) => {
      const nextSection = prev[section].filter((item) => item.id !== itemId || item.isDefault);
      if (nextSection.length === prev[section].length) {
        return prev;
      }

      return {
        ...prev,
        [section]: nextSection
      };
    });
  };

  const handleLibraryCopy = async (value, itemId) => {
    if (!value) {
      return;
    }

    if (libraryCopyTimeoutRef.current) {
      clearTimeout(libraryCopyTimeoutRef.current);
      libraryCopyTimeoutRef.current = null;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setLibraryCopyStatus({ id: itemId, message: 'Copied to clipboard' });
      } else {
        throw new Error('Clipboard not available');
      }
    } catch (copyError) {
      console.warn('Library copy failed:', copyError);
      setLibraryCopyStatus({ id: itemId, message: 'Copy not supported in this browser' });
    }
  };

  const handleResetPromptDraft = () => {
    setPromptDraft({ ...EMPTY_PROMPT_DRAFT });
    setPromptDraftError(null);
  };

  const handleResetCommandDraft = () => {
    setCommandDraft({ ...EMPTY_COMMAND_DRAFT });
    setCommandDraftError(null);
  };

  const headerSubtitle = useMemo(() => {
    switch (activeTab) {
      case 'prompt-optimizer':
        return 'Turn rough ideas into clear, AI-ready prompts.';
      case 'prompt-library':
        return 'Save AI prompts and Git commands for quick reuse.';
      case 'email-digest':
        return 'Email analytics and digest workflows, coming soon.';
      default:
        return 'Compare AI providers side-by-side to find the best response.';
    }
  }, [activeTab]);

  const handleModelFieldChange = (id, field, value) => {
    setModels((prev) =>
      prev.map((model) => {
        if (model.id !== id) return model;

        if (field === 'providerId') {
          const provider = PROVIDER_CONFIG[value] || {};
          return {
            ...model,
            providerId: value,
            model: provider.defaultModel || '',
            authenticatedAt: null,
            authError: null
          };
        }

        return {
          ...model,
          [field]: value,
          ...(field === 'apiKey' ? { authenticatedAt: null, authError: null } : {})
        };
      })
    );
  };

  const handleToggleActive = (id) => {
    setModels((prev) =>
      prev.map((model) =>
        model.id === id ? { ...model, isActive: !model.isActive } : model
      )
    );
  };

  const handleRemoveModel = (id) => {
    setModels((prev) => prev.filter((model) => model.id !== id));
  };

  const handleAuthenticate = async (id) => {
    const target = models.find((model) => model.id === id);
    if (!target) return;

    try {
      await authenticateModel({
        providerId: target.providerId,
        apiKey: target.apiKey
      });

      setModels((prev) =>
        prev.map((model) =>
          model.id === id
            ? {
                ...model,
                authenticatedAt: new Date().toISOString(),
                authError: null
              }
            : model
        )
      );
      setManagerMessage(`Authenticated ${target.name || target.model}.`);
    } catch (authError) {
      setModels((prev) =>
        prev.map((model) =>
          model.id === id
            ? {
                ...model,
                authenticatedAt: null,
                authError: authError.message
              }
            : model
        )
      );
      setManagerMessage(null);
    }
  };

  const handleNewModelChange = (field, value) => {
    if (field === 'providerId') {
      const provider = PROVIDER_CONFIG[value] || {};
      setNewModel((prev) => ({
        ...prev,
        providerId: value,
        model: provider.defaultModel || '',
        apiKey: '',
        name: prev.name
      }));
      return;
    }

    setNewModel((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddModel = (e) => {
    e.preventDefault();
    const trimmedName = newModel.name.trim();
    const trimmedModel = newModel.model.trim();

    if (!trimmedName || !trimmedModel) {
      setManagerMessage('Add a name and model identifier before saving.');
      return;
    }

    const id = `${newModel.providerId}-${Date.now()}`;
    setModels((prev) => [
      ...prev,
      {
        id,
        providerId: newModel.providerId,
        name: trimmedName,
        model: trimmedModel,
        apiKey: newModel.apiKey.trim(),
        isActive: true,
        authenticatedAt: null,
        authError: null
      }
    ]);

    const defaultProvider = PROVIDER_CONFIG[newModel.providerId] || {};

    setNewModel({
      providerId: newModel.providerId,
      name: '',
      model: defaultProvider.defaultModel || '',
      apiKey: ''
    });

    setManagerMessage('Model added. Authenticate to validate custom keys.');
  };

  const formatAuthStatus = (model) => {
    if (model.authError) {
      return model.authError;
    }

    if (model.authenticatedAt) {
      return `Authenticated at ${new Date(model.authenticatedAt).toLocaleTimeString()}`;
    }

    return 'Not authenticated';
  };

  const totalModels = models.length;
  const inactiveModels = Math.max(0, totalModels - activeModels.length);

  const ModelManager = () => (
    <section className="model-manager">
      <div className="model-list">
        {models.map((model) => (
          <div key={model.id} className={`model-card ${model.isActive ? 'active' : ''}`}>
            <div className="model-card__header">
              <input
                type="text"
                value={model.name}
                onChange={(event) => handleModelFieldChange(model.id, 'name', event.target.value)}
                placeholder="Display name"
              />
              <label className="model-card__toggle">
                <input
                  type="checkbox"
                  checked={model.isActive}
                  onChange={() => handleToggleActive(model.id)}
                />
                <span>Active</span>
              </label>
            </div>

            <div className="model-card__row">
              <label>
                Provider
                <select
                  value={model.providerId}
                  onChange={(event) => handleModelFieldChange(model.id, 'providerId', event.target.value)}
                >
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model ID
                <input
                  type="text"
                  value={model.model}
                  onChange={(event) => handleModelFieldChange(model.id, 'model', event.target.value)}
                  placeholder="e.g. gpt-4-turbo"
                />
              </label>
            </div>

            <label className="model-card__api">
              API Key Override
              <input
                type="password"
                value={model.apiKey}
                onChange={(event) => handleModelFieldChange(model.id, 'apiKey', event.target.value)}
                placeholder="Leave blank to use .env key"
              />
            </label>

            <div className="model-card__footer">
              <div className={`model-card__status ${model.authError ? 'error' : ''}`}>
                {formatAuthStatus(model)}
              </div>
              <div className="model-card__actions">
                <button type="button" onClick={() => handleAuthenticate(model.id)}>
                  Authenticate
                </button>
                <button type="button" className="secondary" onClick={() => handleRemoveModel(model.id)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form className="add-model" onSubmit={handleAddModel}>
        <h3>Add another model</h3>
        <div className="add-model__row">
          <label>
            Provider
            <select
              value={newModel.providerId}
              onChange={(event) => handleNewModelChange('providerId', event.target.value)}
            >
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Display Name
            <input
              type="text"
              value={newModel.name}
              onChange={(event) => handleNewModelChange('name', event.target.value)}
              placeholder="My custom model"
            />
          </label>

          <label>
            Model ID
            <input
              type="text"
              value={newModel.model}
              onChange={(event) => handleNewModelChange('model', event.target.value)}
              placeholder="Model identifier"
            />
          </label>
        </div>

        <label className="add-model__api">
          API Key Override (optional)
          <input
            type="password"
            value={newModel.apiKey}
            onChange={(event) => handleNewModelChange('apiKey', event.target.value)}
            placeholder="Paste key to override .env"
          />
        </label>

        <button type="submit">Add Model</button>
      </form>
    </section>
  );

  const segmentOptions = useMemo(() => {
    if (activeModels.length === 0) {
      return [];
    }

    const options = [
      {
        id: 'all',
        label: 'All',
        sublabel: activeModels.length > 1 ? 'View all responses' : 'View response'
      }
    ];

    activeModels.forEach((model) => {
      const providerName = PROVIDER_CONFIG[model.providerId]?.displayName || model.providerId;
      options.push({
        id: model.id,
        label: model.name || model.model,
        sublabel: providerName
      });
    });

    return options;
  }, [activeModels]);

  const showSegmentedControl = segmentOptions.length > 1 && activeModels.length > 1;

  const displayedModels = useMemo(() => {
    if (activePanel === 'all') {
      return activeModels;
    }

    return activeModels.filter((model) => model.id === activePanel);
  }, [activeModels, activePanel]);

  const handleSegmentKeyDown = (event) => {
    if (!showSegmentedControl) {
      return;
    }

    const currentIndex = segmentOptions.findIndex((option) => option.id === activePanel);
    if (currentIndex === -1) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextOption = segmentOptions[(currentIndex + 1) % segmentOptions.length];
      setActivePanel(nextOption.id);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex = (currentIndex - 1 + segmentOptions.length) % segmentOptions.length;
      setActivePanel(segmentOptions[previousIndex].id);
    }
  };

  const handleReplyToggle = (modelId) => {
    setReplyStates((prev) => {
      const current = prev[modelId] || { isOpen: false, value: '' };
      const nextIsOpen = !current.isOpen;
      return {
        ...prev,
        [modelId]: nextIsOpen ? { ...current, isOpen: true } : { isOpen: false, value: '' }
      };
    });
  };

  const handleReplyChange = (modelId, value) => {
    setReplyStates((prev) => ({
      ...prev,
      [modelId]: {
        ...(prev[modelId] || { isOpen: true }),
        isOpen: true,
        value
      }
    }));
  };

  const handleReplySubmit = async (event, model) => {
    event.preventDefault();

    const state = replyStates[model.id] || {};
    const trimmedMessage = state.value?.trim();
    if (!trimmedMessage) {
      return;
    }

    const existingConversation = modelConversations[model.id] || [];
    const conversationWithUser = [...existingConversation, { sender: 'user', text: trimmedMessage }];
    const promptPayload = formatConversationForPrompt(conversationWithUser);

    setReplyLoading((prev) => ({ ...prev, [model.id]: true }));
    setModelConversations((prev) => ({
      ...prev,
      [model.id]: conversationWithUser
    }));

    try {
      const response = await callAIModel({
        providerId: model.providerId,
        prompt: promptPayload,
        model: model.model,
        apiKey: model.apiKey
      });

      setModelResponses((prev) => ({
        ...prev,
        [model.id]: response
      }));

      if (response?.content) {
        setModelConversations((prev) => {
          const currentConversation = prev[model.id] || conversationWithUser;
          return {
            ...prev,
            [model.id]: [...currentConversation, { sender: 'assistant', text: response.content }]
          };
        });
      }

      if (responseCopyTimeoutRef.current[model.id]) {
        clearTimeout(responseCopyTimeoutRef.current[model.id]);
        delete responseCopyTimeoutRef.current[model.id];
      }

      setReplyStates((prev) => ({
        ...prev,
        [model.id]: { isOpen: true, value: '' }
      }));

      setCopyStatuses((prev) => {
        const next = { ...prev };
        delete next[model.id];
        return next;
      });
    } catch (err) {
      const message = err?.message || 'Failed to get a response.';
      setModelResponses((prev) => ({
        ...prev,
        [model.id]: {
          error: message,
          model: model.model
        }
      }));
    } finally {
      setReplyLoading((prev) => ({
        ...prev,
        [model.id]: false
      }));
    }
  };

  const handleCopyResponse = async (modelId) => {
    const conversation = modelConversations[modelId] || [];
    const assistantMessages = conversation
      .filter((message) => message.sender === 'assistant' && message.text)
      .map((message) => message.text.trim())
      .filter(Boolean);

    if (assistantMessages.length === 0) {
      return;
    }

    const textToCopy = assistantMessages.join('\n\n');

    const copyWithFallback = async (text) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }

      if (typeof document === 'undefined') {
        throw new Error('Clipboard not supported in this environment');
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };

    try {
      await copyWithFallback(textToCopy);
      setCopyStatuses((prev) => ({
        ...prev,
        [modelId]: 'Copied!'
      }));
    } catch (error) {
      setCopyStatuses((prev) => ({
        ...prev,
        [modelId]: 'Copy failed'
      }));
    }

    if (responseCopyTimeoutRef.current[modelId]) {
      clearTimeout(responseCopyTimeoutRef.current[modelId]);
    }

    responseCopyTimeoutRef.current[modelId] = setTimeout(() => {
      setCopyStatuses((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      delete responseCopyTimeoutRef.current[modelId];
    }, 2400);
  };

  const renderResponseCard = (model) => {
    const response = modelResponses[model.id];
    const conversation = modelConversations[model.id] || [];
    const providerName = PROVIDER_CONFIG[model.providerId]?.displayName || model.providerId;
    const replyState = replyStates[model.id] || { isOpen: false, value: '' };
    const isReplyInFlight = Boolean(replyLoading[model.id]);
    const assistantMessages = conversation.filter((message) => message.sender === 'assistant');
    const hasAssistantMessages = assistantMessages.length > 0;
    const copyStatus = copyStatuses[model.id];
    const hasError = Boolean(response?.error);
    const hasConversation = conversation.length > 0;
    const showInitialPlaceholder = !hasConversation && !hasError;
    const isInitialLoading = loading && !response;
    const canReply = hasAssistantMessages && !loading && !isReplyInFlight && !hasError;

    return (
      <div key={model.id} className="response-card">
        <h3>
          {model.name || model.model}
        </h3>
        <p className="model-info">Provider: {providerName}</p>
        <div className="response-content">
          {(hasConversation || hasError) && !showInitialPlaceholder && (
            <p className="model-info">Model: {response?.model || model.model}</p>
          )}
          <div className="response-text">
            {hasError ? (
              <p className="error-text">{response.error}</p>
            ) : hasConversation ? (
              <div className="response-conversation">
                {conversation.map((message, index) => {
                  const paragraphs = String(message.text || '')
                    .split('\n')
                    .filter((line) => line.trim().length > 0);
                  return (
                    <div
                      key={`${model.id}-message-${index}`}
                      className={`response-message response-message--${message.sender}`}
                    >
                      <span className="response-message__label">
                        {message.sender === 'user' ? 'You' : model.name || 'AI'}
                      </span>
                      <div className="response-message__body">
                        {paragraphs.length > 0 ? (
                          paragraphs.map((paragraph, paragraphIndex) => (
                            <p key={`${model.id}-message-${index}-p-${paragraphIndex}`}>{paragraph}</p>
                          ))
                        ) : (
                          <p>(No content)</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(loading && !response?.content && !response?.error) && (
                  <div className="response-message response-message--assistant">
                    <span className="response-message__label">{model.name || 'AI'}</span>
                    <div className="response-message__body">
                      <p>Generating response...</p>
                    </div>
                  </div>
                )}
                {isReplyInFlight && (
                  <div className="response-message response-message--assistant">
                    <span className="response-message__label">{model.name || 'AI'}</span>
                    <div className="response-message__body">
                      <p>Thinking through your follow-up...</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="loading-placeholder">
                {isInitialLoading ? 'Waiting for response...' : 'Submit a prompt to see a response.'}
              </div>
            )}
          </div>
        </div>
        {hasAssistantMessages && (
          <div className="response-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleReplyToggle(model.id)}
              disabled={!canReply}
            >
              {replyState.isOpen ? 'Close Reply' : 'Reply'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleCopyResponse(model.id)}
              disabled={!hasAssistantMessages}
            >
              {copyStatus || 'Copy'}
            </button>
          </div>
        )}
        {replyState.isOpen && (
          <form className="reply-form" onSubmit={(event) => handleReplySubmit(event, model)}>
            <label htmlFor={`reply-${model.id}`}>Follow-up message</label>
            <textarea
              id={`reply-${model.id}`}
              value={replyState.value || ''}
              onChange={(event) => handleReplyChange(model.id, event.target.value)}
              rows={3}
              placeholder="Ask a follow-up or provide more detail..."
              disabled={isReplyInFlight}
            />
            <div className="reply-actions">
              <button type="submit" disabled={isReplyInFlight || !(replyState.value || '').trim()}>
                {isReplyInFlight ? 'Sending...' : 'Send Reply'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleReplyToggle(model.id)}
                disabled={isReplyInFlight}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="App" data-theme={darkMode ? 'dark' : 'light'}>
      <header className="App-header">
        <div className="header-content">
          <h1>Better. AI</h1>
          <p>{headerSubtitle}</p>
          
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === 'ai-comparison' ? 'active' : ''}`}
              onClick={() => handleTabChange('ai-comparison')}
            >
              🤖 AI Comparison
            </button>
            <button
              className={`tab-button ${activeTab === 'prompt-optimizer' ? 'active' : ''}`}
              onClick={() => handleTabChange('prompt-optimizer')}
            >
              🧠 Prompt Optimizer
            </button>
            <button
              className={`tab-button ${activeTab === 'prompt-library' ? 'active' : ''}`}
              onClick={() => handleTabChange('prompt-library')}
            >
              📚 Prompt Library
            </button>
            <button
              className={`tab-button ${activeTab === 'email-digest' ? 'active' : ''}`}
              onClick={() => handleTabChange('email-digest')}
            >
              📧 Email Digest
            </button>
          </div>

          <div className="header-toolbar">
            <div className="section-tools">{renderSectionToolButtons()}</div>
            <div className="header-buttons">
              <button
                className="dark-mode-button"
                onClick={toggleDarkMode}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              {activeTab === 'ai-comparison' && (
                <button
                  className="setup-button"
                  onClick={() => setShowSetupInstructions(!showSetupInstructions)}
                >
                  {showSetupInstructions ? 'Hide' : 'Show'} API Setup Instructions
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="App-main">
        {activeTab === 'ai-comparison' && (
          <div className="tab-content">
            {showSetupInstructions && (
              <div className="setup-instructions">
                <h3>{getSetupInstructions().title}</h3>
                <ol>
                  {getSetupInstructions().steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
                <p className="setup-note">{getSetupInstructions().note}</p>
              </div>
            )}

            {isComparisonToolsOpen && (
              <section className="comparison-tools">
                <div className="comparison-tools__header">
                  <h2>Model Manager</h2>
                  <p>Configure which AI accounts and models to compare side-by-side.</p>
                </div>

                <div className="comparison-tools__summary">
                  <div>
                    <span className="summary-value">{activeModels.length}</span>
                    <span className="summary-label">Active models</span>
                  </div>
                  <div>
                    <span className="summary-value">{totalModels}</span>
                    <span className="summary-label">Total configured</span>
                  </div>
                  <div>
                    <span className="summary-value">{inactiveModels}</span>
                    <span className="summary-label">Inactive</span>
                  </div>
                </div>

                {managerMessage && <div className="comparison-tools__message">{managerMessage}</div>}

                <div className="comparison-tools__content">
                  <ModelManager />
                </div>
              </section>
            )}

            <form onSubmit={handleSubmit} className="prompt-form">
              <div className="input-group">
                <label htmlFor="prompt">Enter your prompt:</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={handlePromptChange}
                  placeholder="Type your question or prompt here..."
                  rows={4}
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading || !prompt.trim()}>
                {loading ? 'Getting Responses...' : 'Send to All AI Tools'}
              </button>
            </form>

            {error && <div className="error-message">{error}</div>}

            {activeModels.length > 0 && (
              <div className="responses-section">
                {showSegmentedControl && (
                  <div className="response-selector">
                    <div
                      className="segmented-control"
                      role="radiogroup"
                      aria-label="Choose which responses to display"
                    >
                      {segmentOptions.map((option) => (
                        <button
                          type="button"
                          key={option.id}
                          className={`segmented-option ${activePanel === option.id ? 'active' : ''}`}
                          onClick={() => setActivePanel(option.id)}
                          role="radio"
                          aria-checked={activePanel === option.id}
                          tabIndex={activePanel === option.id ? 0 : -1}
                          onKeyDown={handleSegmentKeyDown}
                        >
                          <span className="option-title">{option.label}</span>
                          <span className="option-subtitle">{option.sublabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`responses-container ${activePanel !== 'all' ? 'single' : ''}`}>
                  {displayedModels.map((model) => renderResponseCard(model))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prompt-optimizer' && (
          <div className="tab-content">
            <section className="optimizer-card">
              <div className="optimizer-card__header">
                <h2>Prompt Optimizer</h2>
                <p>Polish your prompt for clarity, context, and structure so AI models deliver stronger answers.</p>
              </div>

              <form className="optimizer-form" onSubmit={handleOptimizePrompt}>
                <label htmlFor="optimizer-prompt">Paste or type your prompt</label>
                <textarea
                  id="optimizer-prompt"
                  value={optimizerPrompt}
                  onChange={handleOptimizerInputChange}
                  placeholder="Describe what you want the AI to produce. Include goals, constraints, and audience."
                  rows={8}
                />

                <div className="optimizer-actions">
                  <button type="submit" disabled={isOptimizeDisabled}>
                    Optimize Prompt
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleResetOptimizer}
                    disabled={isOptimizeDisabled && !optimizerResult}
                  >
                    Clear
                  </button>
                </div>
              </form>

              {optimizerTouched && !optimizerPrompt.trim() && (
                <div className="optimizer-error">Add a prompt to optimize.</div>
              )}

              <ul className="optimizer-hints">
                <li>Include who the response is for and any constraints that must be respected.</li>
                <li>Call out the desired output format or example if you already know what works well.</li>
              </ul>
            </section>

            {optimizerResult ? (
              <section className="optimizer-results">
                <div className="optimizer-results__header">
                  <h2>Optimized Prompt</h2>
                  <div className="optimizer-copy">
                    {optimizerCopyStatus && (
                      <span className="optimizer-copy__status">{optimizerCopyStatus}</span>
                    )}
                    <button type="button" className="secondary-button" onClick={handleCopyOptimizedPrompt}>
                      Copy optimized prompt
                    </button>
                  </div>
                </div>

                <pre className="optimized-prompt-block">{optimizerResult.optimizedPrompt}</pre>

                <div className="optimizer-grid">
                  <div className="optimizer-panel">
                    <h3>Strengths</h3>
                    {optimizerResult.strengths.length > 0 ? (
                      <ul>
                        {optimizerResult.strengths.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="optimizer-empty">Add more context to surface prompt strengths.</p>
                    )}
                  </div>
                  <div className="optimizer-panel">
                    <h3>Suggestions</h3>
                    {optimizerResult.suggestions.length > 0 ? (
                      <ul>
                        {optimizerResult.suggestions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="optimizer-empty">Your prompt already covers the key ingredients.</p>
                    )}
                  </div>
                </div>

                <div className="optimizer-grid optimizer-grid--compact">
                  <div className="optimizer-panel">
                    <h3>Quality Checklist</h3>
                    <ul className="optimizer-checklist">
                      {optimizerResult.checklist.map((item) => (
                        <li key={item.label} className={`checklist-item ${item.status}`}>
                          <span className="checklist-item__label">{item.label}</span>
                          <span className="checklist-item__tip">{item.tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="optimizer-panel">
                    <h3>Prompt Metrics</h3>
                    <div className="optimizer-metrics">
                      <div>
                        <span className="metric-label">Words</span>
                        <span className="metric-value">{optimizerResult.metrics.wordCount}</span>
                      </div>
                      <div>
                        <span className="metric-label">Sentences</span>
                        <span className="metric-value">{optimizerResult.metrics.sentenceCount}</span>
                      </div>
                      <div>
                        <span className="metric-label">Avg. words / sentence</span>
                        <span className="metric-value">{optimizerResult.metrics.averageSentenceLength}</span>
                      </div>
                      <div>
                        <span className="metric-label">Est. reading time</span>
                        <span className="metric-value">{optimizerResult.metrics.estimatedReadingTime} min</span>
                      </div>
                    </div>
                  </div>
                </div>

                {optimizerResult.followUpQuestions.length > 0 && (
                  <div className="optimizer-panel">
                    <h3>Suggested follow-up questions</h3>
                    <ul>
                      {optimizerResult.followUpQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              <div className="section-placeholder">
                <div className="section-placeholder__icon">🧠</div>
                <h2>Generate an optimized prompt</h2>
                <p>Feed the form above with your rough request to unlock tailored guidance.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prompt-library' && (
          <div className="tab-content">
            <section className="library-hero">
              <div>
                <h2>Prompt &amp; Command Library</h2>
                <p>Pin your favourite prompts for AI models and keep essential Git commands one click away.</p>
              </div>
              <div className="library-hero__stats">
                <div className="library-hero__stat">
                  <span className="stat-value">{totalPrompts}</span>
                  <span className="stat-label">Prompts saved</span>
                </div>
                <div className="library-hero__stat">
                  <span className="stat-value">{totalCommands}</span>
                  <span className="stat-label">Git commands</span>
                </div>
                <div className="library-hero__stat">
                  <span className="stat-value">{customEntryCount}</span>
                  <span className="stat-label">Custom entries</span>
                </div>
              </div>
            </section>

            <div className="library-grid">
              <section className="library-column">
                <div className="library-column__header">
                  <h3>Saved Prompts</h3>
                  <span>{totalPrompts} ready-to-use</span>
                </div>

                <form className="library-form" onSubmit={handleAddPromptToLibrary}>
                  <div className="library-form__row">
                    <label>
                      Title
                      <input
                        type="text"
                        value={promptDraft.title}
                        onChange={(event) => handlePromptDraftChange('title', event.target.value)}
                        placeholder="e.g. Customer interview debrief"
                      />
                    </label>
                    <label>
                      Tags (optional)
                      <input
                        type="text"
                        value={promptDraft.tags}
                        onChange={(event) => handlePromptDraftChange('tags', event.target.value)}
                        placeholder="product, discovery"
                      />
                    </label>
                  </div>

                  <label>
                    Short description (optional)
                    <input
                      type="text"
                      value={promptDraft.description}
                      onChange={(event) => handlePromptDraftChange('description', event.target.value)}
                      placeholder="Where you use this prompt"
                    />
                  </label>

                  <label>
                    Prompt text
                    <textarea
                      value={promptDraft.content}
                      onChange={(event) => handlePromptDraftChange('content', event.target.value)}
                      rows={6}
                      placeholder="Paste the prompt you want to reuse..."
                    />
                  </label>

                  {promptDraftError && <div className="library-error">{promptDraftError}</div>}

                  <div className="library-form__actions">
                    <button type="submit">Save Prompt</button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleResetPromptDraft}
                      disabled={
                        !promptDraft.title &&
                        !promptDraft.content &&
                        !promptDraft.description &&
                        !promptDraft.tags
                      }
                    >
                      Clear
                    </button>
                  </div>
                </form>

                <div className="library-list">
                  {library.prompts.map((item) => (
                    <article key={item.id} className="library-card">
                      <header className="library-card__header">
                        <div className="library-card__meta">
                          <h4>{item.title}</h4>
                          {item.description && <p>{item.description}</p>}
                        </div>
                        <div className="library-card__actions">
                          {item.isDefault && <span className="library-chip">Default</span>}
                          {libraryCopyStatus?.id === item.id && (
                            <span className="library-card__status">{libraryCopyStatus.message}</span>
                          )}
                          <button type="button" onClick={() => handleLibraryCopy(item.content, item.id)}>
                            Copy
                          </button>
                          {!item.isDefault && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleRemoveLibraryItem('prompts', item.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </header>
                      <pre className="library-card__content">{item.content}</pre>
                      {item.tags?.length > 0 && (
                        <div className="library-tags">
                          {item.tags.map((tag) => (
                            <span key={tag} className="library-tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <section className="library-column">
                <div className="library-column__header">
                  <h3>Git Commands</h3>
                  <span>{totalCommands} essentials</span>
                </div>

                <form className="library-form" onSubmit={handleAddCommandToLibrary}>
                  <div className="library-form__row">
                    <label>
                      Label
                      <input
                        type="text"
                        value={commandDraft.title}
                        onChange={(event) => handleCommandDraftChange('title', event.target.value)}
                        placeholder="e.g. Sync main branch"
                      />
                    </label>
                    <label>
                      Tags (optional)
                      <input
                        type="text"
                        value={commandDraft.tags}
                        onChange={(event) => handleCommandDraftChange('tags', event.target.value)}
                        placeholder="release, daily"
                      />
                    </label>
                  </div>

                  <label>
                    Notes (optional)
                    <input
                      type="text"
                      value={commandDraft.description}
                      onChange={(event) => handleCommandDraftChange('description', event.target.value)}
                      placeholder="When to run this command"
                    />
                  </label>

                  <label>
                    Command
                    <textarea
                      value={commandDraft.content}
                      onChange={(event) => handleCommandDraftChange('content', event.target.value)}
                      rows={4}
                      placeholder="git checkout main"
                    />
                  </label>

                  {commandDraftError && <div className="library-error">{commandDraftError}</div>}

                  <div className="library-form__actions">
                    <button type="submit">Save Command</button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleResetCommandDraft}
                      disabled={
                        !commandDraft.title &&
                        !commandDraft.content &&
                        !commandDraft.description &&
                        !commandDraft.tags
                      }
                    >
                      Clear
                    </button>
                  </div>
                </form>

                <div className="library-list">
                  {library.commands.map((item) => (
                    <article key={item.id} className="library-card">
                      <header className="library-card__header">
                        <div className="library-card__meta">
                          <h4>{item.title}</h4>
                          {item.description && <p>{item.description}</p>}
                        </div>
                        <div className="library-card__actions">
                          {item.isDefault && <span className="library-chip">Default</span>}
                          {libraryCopyStatus?.id === item.id && (
                            <span className="library-card__status">{libraryCopyStatus.message}</span>
                          )}
                          <button type="button" onClick={() => handleLibraryCopy(item.content, item.id)}>
                            Copy
                          </button>
                          {!item.isDefault && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleRemoveLibraryItem('commands', item.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </header>
                      <pre className="library-card__code"><code>{item.content}</code></pre>
                      {item.tags?.length > 0 && (
                        <div className="library-tags">
                          {item.tags.map((tag) => (
                            <span key={tag} className="library-tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'email-digest' && (
          <div className="tab-content">
            <div className="placeholder-content">
              <div className="placeholder-icon">📧</div>
              <h2>Email Digest Tool</h2>
              <p>Your email digest tool will be integrated here.</p>
              <div className="placeholder-features">
                <div className="feature-item">
                  <span className="feature-icon">📊</span>
                  <span>Analytics & Insights</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📅</span>
                  <span>Scheduled Reports</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🎯</span>
                  <span>Custom Templates</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">📈</span>
                  <span>Performance Tracking</span>
                </div>
              </div>
              <div className="coming-soon">
                <p>🚀 Coming Soon</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
