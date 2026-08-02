// AI Providers Module - Real API Integrations
// Handles actual API calls to OpenAI, Anthropic, Google, Cohere, Perplexity, and Mistral

class AIProviders {
    constructor() {
        this.apiKeys = {
            openai: '',
            anthropic: '',
            google: '',
            cohere: '',
            perplexity: '',
            mistral: ''
        };
        
        this.modelConfigs = {
            'gpt-4o': { provider: 'openai', model: 'gpt-4o', costPer1kTokens: 0.005 },
            'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', costPer1kTokens: 0.00015 },
            'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo-preview', costPer1kTokens: 0.01 },
            'gpt-3.5-turbo': { provider: 'openai', model: 'gpt-3.5-turbo', costPer1kTokens: 0.0005 },
            'claude-3-opus': { provider: 'anthropic', model: 'claude-3-opus-20240229', costPer1kTokens: 0.015 },
            'claude-3-sonnet': { provider: 'anthropic', model: 'claude-3-sonnet-20240229', costPer1kTokens: 0.003 },
            'claude-3-haiku': { provider: 'anthropic', model: 'claude-3-haiku-20240307', costPer1kTokens: 0.00025 },
            'gemini-1.5-pro': { provider: 'google', model: 'gemini-1.5-pro', costPer1kTokens: 0.00125 },
            'gemini-1.5-flash': { provider: 'google', model: 'gemini-1.5-flash', costPer1kTokens: 0.000125 },
            'command-r-plus': { provider: 'cohere', model: 'command-r-plus', costPer1kTokens: 0.003 },
            'command-r': { provider: 'cohere', model: 'command-r', costPer1kTokens: 0.0005 },
            'llama-3-70b': { provider: 'perplexity', model: 'llama-3-70b-instruct', costPer1kTokens: 0.001 },
            'llama-3-8b': { provider: 'perplexity', model: 'llama-3-8b-instruct', costPer1kTokens: 0.0002 },
            'mistral-large': { provider: 'mistral', model: 'mistral-large-latest', costPer1kTokens: 0.008 },
            'mistral-medium': { provider: 'mistral', model: 'mistral-medium-latest', costPer1kTokens: 0.0027 },
            'mistral-small': { provider: 'mistral', model: 'mistral-small-latest', costPer1kTokens: 0.001 }
        };
        this.fetchTimeoutMs = 30000;
        this.maxOutputTokens = 900;
    }

    setApiKey(provider, key) {
        this.apiKeys[provider] = key;
    }

    getApiKey(provider) {
        return this.apiKeys[provider];
    }

    sanitizeErrorMessage(error) {
        const message = error && error.message ? error.message : String(error || 'Provider request failed');
        return message
            .replace(/https?:\/\/[^\s)]+/gi, '[url redacted]')
            .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
            .replace(/(x-api-key|x-goog-api-key|api[_-]?key|token)(\s*[:=]\s*)([A-Za-z0-9._~+/=-]+)/gi, '$1$2[redacted]')
            .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]')
            .slice(0, 240);
    }

    logProviderFailure(provider, error) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(`${provider} API call failed: ${this.sanitizeErrorMessage(error)}`);
        }
    }

    truncateText(value, maxLength = 700) {
        const text = value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
    }

    normalizeList(value) {
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
    }

    labelForItem(item) {
        if (typeof item === 'string') return item;
        if (!item) return '';
        return item.name || item.fullName || item.username || item.text || item.value || item.id || '';
    }

    formatComments(comments) {
        return this.normalizeList(comments).slice(0, 8).map((comment, index) => {
            if (typeof comment === 'string') {
                return `${index + 1}. ${this.truncateText(comment, 500)}`;
            }

            const member = comment.memberCreator || comment.member || comment.author || '';
            const memberName = typeof member === 'string' ? member : this.labelForItem(member);
            const date = comment.date ? ` (${comment.date})` : '';
            const text = this.truncateText(comment.text || comment.data?.text || comment.comment || '', 500);
            return `${index + 1}. ${memberName ? `${memberName}${date}: ` : ''}${text}`;
        }).filter(Boolean);
    }

    formatChecklists(checklists) {
        return this.normalizeList(checklists).slice(0, 8).map((checklist) => {
            const items = this.normalizeList(checklist && checklist.checkItems);
            const open = items.filter((item) => item && item.state !== 'complete').slice(0, 8)
                .map((item) => this.truncateText(item.name || item.text || item.id || '', 120))
                .filter(Boolean);
            const complete = items.filter((item) => item && item.state === 'complete').length;
            const name = this.truncateText((checklist && (checklist.name || checklist.id)) || 'Checklist', 80);
            return `${name}: ${complete}/${items.length} complete${open.length ? `; open: ${open.join('; ')}` : ''}`;
        }).filter(Boolean);
    }

    formatAttachments(attachments) {
        return this.normalizeList(attachments).slice(0, 12).map((attachment) => {
            const name = this.truncateText(this.labelForItem(attachment) || 'Attachment', 120);
            const status = attachment && (attachment.extractionStatus || attachment.status || (attachment.extractedText ? 'text-extracted' : 'metadata-only'));
            const type = attachment && (attachment.mimeType || attachment.category || attachment.type || '');
            const preview = attachment && (attachment.extractedTextPreview || attachment.textPreview || attachment.extractedText);
            return `${name}${type ? ` (${type})` : ''}: ${status || 'metadata-only'}${preview ? `; preview: ${this.truncateText(preview, 250)}` : ''}`;
        }).filter(Boolean);
    }

    buildOperationalPrompt(cardData = {}) {
        const labels = this.normalizeList(cardData.labels).map((item) => this.labelForItem(item)).filter(Boolean);
        const members = this.normalizeList(cardData.members).map((item) => this.labelForItem(item)).filter(Boolean);
        const comments = this.formatComments(cardData.comments || cardData.actions);
        const checklists = this.formatChecklists(cardData.checklists);
        const attachments = this.formatAttachments(cardData.attachments);
        const sourceStatus = cardData.__sourceStatus ? JSON.stringify(cardData.__sourceStatus) : 'No explicit source-status metadata.';
        const sourceCounts = cardData.__sourceCounts || cardData.badges ? JSON.stringify(cardData.__sourceCounts || cardData.badges) : 'No reported source counts.';

        return `Analyze this Trello card as an evidence-backed operational intelligence ledger for Robert's workflow.

Return only valid JSON with this schema:
{
  "about": "what this card is about and why it exists",
  "history": "what has happened so far, grounded in card data",
  "status": "current operational status",
  "completedWork": ["specific completed work"],
  "blockers": ["specific blocker, missing information, or waiting state"],
  "waitingOn": ["who or what the card is waiting on"],
  "unclearPoints": ["contradiction, ambiguity, or unverified assumption"],
  "nextSteps": ["specific next action with owner if detectable"],
  "robertDecisions": ["Yes/No decision that requires Robert, including why"],
  "vaReadyActions": ["delegable VA/team action that does not need Robert approval"],
  "risks": ["deadline, client, quality, financial, legal, or communication risk"],
  "missingInfo": ["missing data needed before acting"],
  "unresolvedQuestions": ["question that should be answered"],
  "insights": ["important operational insight"],
  "facts": ["claim directly stated in supplied card data"],
  "inferences": ["interpretation that requires human review"],
  "uncertainty": ["information that could not be verified"],
  "unsupportedClaims": ["claim that must not be treated as fact"],
  "evidenceClaims": [{"claim":"factual claim","source":"title|description|comment|activity|checklist|label|member|due|attachment|custom-field","confidence":"supported|uncertain"}],
  "validationFindings": ["unsupported, conflicting, incomplete, or attachment-extraction issue"],
  "confidenceReason": "brief explanation based on data completeness and evidence coverage"
}

Rules:
- Do not invent dates, people, amounts, attachment contents, or history.
- If comments, activity, custom fields, or attachments failed to load, say so in validationFindings.
- If attachments are metadata-only, do not claim their contents were read.
- Prefer concrete Robert decisions and VA-ready actions over vague follow-up advice.
- Do not suggest posting to Trello as already done; only draft safe next actions.

Card:
Title: ${this.truncateText(cardData.name || cardData.title || 'Untitled Trello card', 180)}
Board: ${this.truncateText(cardData.board || cardData.boardName || 'Unknown', 120)}
List: ${this.truncateText(cardData.list || cardData.listName || 'Unknown', 120)}
Description: ${this.truncateText(cardData.desc || cardData.description || 'No description', 2500)}
Labels: ${labels.length ? labels.join(', ') : 'None'}
Members: ${members.length ? members.join(', ') : 'None'}
Due Date: ${cardData.due || 'Not set'}
Due Complete: ${cardData.dueComplete ? 'yes' : 'no'}
Checklist Progress: ${cardData.checklistProgress || 'No checklist progress'}
Reported source counts: ${sourceCounts}
Source status: ${sourceStatus}
Checklists:
${checklists.length ? checklists.join('\n') : 'No checklist details loaded.'}
Recent comments:
${comments.length ? comments.join('\n') : 'No comment details loaded.'}
Attachments:
${attachments.length ? attachments.join('\n') : 'No attachment metadata loaded.'}`;
    }

    parseProviderJson(text) {
        const raw = typeof text === 'string' ? text : JSON.stringify(text || {});
        const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        try {
            return JSON.parse(cleaned);
        } catch (_error) {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) {
                return JSON.parse(cleaned.slice(start, end + 1));
            }
            throw new Error('AI provider returned invalid JSON.');
        }
    }

    async readProviderError(response) {
        const fallback = `${response.status} ${response.statusText}`.trim();
        try {
            const errorBody = await response.clone().json();
            const rawMessage = errorBody?.error?.message || errorBody?.message || errorBody?.error || '';
            if (rawMessage) {
                return String(rawMessage);
            }
        } catch (_error) {
            // best-effort: JSON may be unavailable or malformed
        }

        try {
            const text = await response.text();
            if (text) {
                return text.slice(0, 200);
            }
        } catch (_error) {
            // best-effort: text response may be unavailable
        }

        return fallback;
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = this.fetchTimeoutMs) {
        const existingSignal = options.signal;
        const controller = new AbortController();
        const mergedOptions = Object.assign({}, options);

        if (existingSignal) {
            if (existingSignal.aborted) {
                controller.abort(existingSignal.reason);
            } else {
                existingSignal.addEventListener("abort", function handleExistingAbort() {
                    controller.abort(existingSignal.reason);
                }, { once: true });
            }
        }

        const timeout = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            mergedOptions.signal = controller.signal;
            return await fetch(url, mergedOptions);
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("AI provider request timed out");
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    // OpenAI API Integration
    async callOpenAI(model, prompt, cardData) {
        const apiKey = this.apiKeys.openai;
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const systemPrompt = 'You analyze Trello cards as evidence-backed operational ledgers. Return only valid JSON and do not invent unsupported facts.';
        const userPrompt = this.buildOperationalPrompt(cardData);

        try {
            const response = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                    max_completion_tokens: this.maxOutputTokens,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errorMessage = await this.readProviderError(response);
                throw new Error(`OpenAI API error: ${this.sanitizeErrorMessage(errorMessage)}`);
            }

            const data = await response.json();
            const content = this.parseProviderJson(data.choices[0].message.content);
            
            return {
                result: content,
                tokensUsed: data.usage.total_tokens,
                cost: this.calculateCost('openai', model, data.usage.total_tokens),
                model: model,
                provider: 'OpenAI'
            };
        } catch (error) {
            this.logProviderFailure('OpenAI', error);
            throw error;
        }
    }

    // Anthropic Claude API Integration
    async callAnthropic(model, prompt, cardData) {
        const apiKey = this.apiKeys.anthropic;
        if (!apiKey) {
            throw new Error('Anthropic API key not configured');
        }

        const systemPrompt = 'You analyze Trello cards as evidence-backed operational ledgers. Return only valid JSON and do not invent unsupported facts.';
        const userPrompt = this.buildOperationalPrompt(cardData);

        try {
            const response = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: this.maxOutputTokens,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: userPrompt }
                    ]
                })
            }, this.fetchTimeoutMs);

            if (!response.ok) {
                const errorMessage = await this.readProviderError(response);
                throw new Error(`Anthropic API error: ${this.sanitizeErrorMessage(errorMessage)}`);
            }

            const data = await response.json();
            const content = this.parseProviderJson(data.content[0].text);
            
            return {
                result: content,
                tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
                cost: this.calculateCost('anthropic', model, data.usage.input_tokens + data.usage.output_tokens),
                model: model,
                provider: 'Anthropic'
            };
        } catch (error) {
            this.logProviderFailure('Anthropic', error);
            throw error;
        }
    }

    // Google Gemini API Integration
    async callGoogle(model, prompt, cardData) {
        const apiKey = this.apiKeys.google;
        if (!apiKey) {
            throw new Error('Google AI API key not configured');
        }

        const prompt_text = this.buildOperationalPrompt(cardData);

        try {
            const response = await this.fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt_text }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: this.maxOutputTokens
                    }
                })
            }, this.fetchTimeoutMs);

            if (!response.ok) {
                const errorMessage = await this.readProviderError(response);
                throw new Error(`Google AI API error: ${this.sanitizeErrorMessage(errorMessage)}`);
            }

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            const content = this.parseProviderJson(text);
            
            return {
                result: content,
                tokensUsed: data.usageMetadata?.totalTokenCount || 0,
                cost: this.calculateCost('google', model, data.usageMetadata?.totalTokenCount || 0),
                model: model,
                provider: 'Google'
            };
        } catch (error) {
            this.logProviderFailure('Google AI', error);
            throw error;
        }
    }

    // Cohere API Integration
    async callCohere(model, prompt, cardData) {
        const apiKey = this.apiKeys.cohere;
        if (!apiKey) {
            throw new Error('Cohere API key not configured');
        }

        const prompt_text = this.buildOperationalPrompt(cardData);

        try {
            const response = await this.fetchWithTimeout('https://api.cohere.ai/v1/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt_text,
                    max_tokens: this.maxOutputTokens,
                    temperature: 0.7
                })
            }, this.fetchTimeoutMs);

            if (!response.ok) {
                const errorMessage = await this.readProviderError(response);
                throw new Error(`Cohere API error: ${this.sanitizeErrorMessage(errorMessage)}`);
            }

            const data = await response.json();
            const content = this.parseProviderJson(data.generations[0].text);
            
            return {
                result: content,
                tokensUsed: data.meta?.billed_units?.output_tokens || 0,
                cost: this.calculateCost('cohere', model, data.meta?.billed_units?.output_tokens || 0),
                model: model,
                provider: 'Cohere'
            };
        } catch (error) {
            this.logProviderFailure('Cohere', error);
            throw error;
        }
    }

    // Perplexity API Integration (OpenAI-compatible)
    async callPerplexity(model, prompt, cardData) {
        const apiKey = this.apiKeys.perplexity;
        if (!apiKey) {
            throw new Error('Perplexity API key not configured');
        }

        const systemPrompt = 'You analyze Trello cards as evidence-backed operational ledgers. Return only valid JSON and do not invent unsupported facts.';
        const userPrompt = this.buildOperationalPrompt(cardData);

        try {
            const response = await this.fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: this.maxOutputTokens,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                })
            });

            if (!response.ok) {
                const errorMessage = await this.readProviderError(response);
                throw new Error(`Perplexity API error: ${this.sanitizeErrorMessage(errorMessage)}`);
            }

            const data = await response.json();
            const content = this.parseProviderJson(data.choices[0].message.content);
            
            return {
                result: content,
                tokensUsed: data.usage?.total_tokens || 0,
                cost: this.calculateCost('perplexity', model, data.usage?.total_tokens || 0),
                model: model,
                provider: 'Perplexity'
            };
        } catch (error) {
            this.logProviderFailure('Perplexity', error);
            throw error;
        }
    }

    // Calculate cost based on tokens used
    calculateCost(provider, model, tokens) {
        const config = this.modelConfigs[model];
        if (!config) return 0;
        return (tokens / 1000) * config.costPer1kTokens;
    }

    // Main analysis method that routes to the correct provider
    async analyzeCard(modelName, cardData) {
        const config = this.modelConfigs[modelName];
        if (!config) {
            throw new Error(`Unknown model: ${modelName}`);
        }

        const provider = config.provider;
        const model = config.model;

        switch (provider) {
            case 'openai':
                return await this.callOpenAI(model, '', cardData);
            case 'anthropic':
                return await this.callAnthropic(model, '', cardData);
            case 'google':
                return await this.callGoogle(model, '', cardData);
            case 'cohere':
                return await this.callCohere(model, '', cardData);
            case 'perplexity':
                return await this.callPerplexity(model, '', cardData);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    // Validate API key by making a test call
    async validateApiKey(provider) {
        const apiKey = this.apiKeys[provider];
        if (!apiKey) {
            return { valid: false, error: 'API key not set' };
        }

        try {
            // Make a minimal test call to validate the key
            switch (provider) {
                case 'openai': {
                    const openaiResponse = await this.fetchWithTimeout('https://api.openai.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    }, 10000);
                    if (!openaiResponse.ok) {
                        const openaiError = await this.readProviderError(openaiResponse);
                        return { valid: false, error: this.sanitizeErrorMessage(openaiError) };
                    }
                    return { valid: true, error: null };
                }

                case 'anthropic': {
                    const anthropicResponse = await this.fetchWithTimeout('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'claude-3-haiku-20240307',
                            max_tokens: Math.min(this.maxOutputTokens, 64),
                            messages: [{ role: 'user', content: 'test' }]
                        })
                    }, 10000);
                    if (!anthropicResponse.ok) {
                        const anthropicError = await this.readProviderError(anthropicResponse);
                        return { valid: false, error: this.sanitizeErrorMessage(anthropicError) };
                    }
                    return { valid: true, error: null };
                }

                default:
                    return { valid: true, error: null }; // Assume valid for other providers
            }
        } catch (error) {
            return { valid: false, error: this.sanitizeErrorMessage(error) };
        }
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIProviders;
}
