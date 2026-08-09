/**
 * Multi-AI Integration System for Summarize This
 * Combines multiple AI models for optimal summarization results
 */

class MultiAIAnalyzer {
    constructor(apiKeys = {}) {
        this.apiKeys = apiKeys;
        this.models = {
            // OpenAI Models
            'gpt-4o': { provider: 'openai', strength: 'reasoning', cost: 0.015 },
            'gpt-4o-mini': { provider: 'openai', strength: 'balanced', cost: 0.004 },
            'gpt-4-turbo': { provider: 'openai', strength: 'comprehensive', cost: 0.01 },
            'gpt-3.5-turbo': { provider: 'openai', strength: 'speed', cost: 0.002 },
            
            // Anthropic Models
            'claude-3-opus': { provider: 'anthropic', strength: 'analysis', cost: 0.015 },
            'claude-3-sonnet': { provider: 'anthropic', strength: 'balanced', cost: 0.003 },
            'claude-3-haiku': { provider: 'anthropic', strength: 'speed', cost: 0.00025 },
            
            // Google Models
            'gemini-1.5-pro': { provider: 'google', strength: 'multimodal', cost: 0.007 },
            'gemini-1.5-flash': { provider: 'google', strength: 'speed', cost: 0.0005 },
            
            // Cohere Models
            'command-r-plus': { provider: 'cohere', strength: 'reasoning', cost: 0.003 },
            'command-r': { provider: 'cohere', strength: 'balanced', cost: 0.0005 },
            
            // Perplexity Models
            'llama-3.1-sonar-huge': { provider: 'perplexity', strength: 'research', cost: 0.005 },
            'llama-3.1-sonar-large': { provider: 'perplexity', strength: 'analysis', cost: 0.001 },
            
            // Mistral Models
            'mistral-large': { provider: 'mistral', strength: 'reasoning', cost: 0.008 },
            'mistral-medium': { provider: 'mistral', strength: 'balanced', cost: 0.0027 },
            
            // Local/Open Source Models (via Ollama or similar)
            'llama-3.1-70b': { provider: 'local', strength: 'privacy', cost: 0 },
            'mixtral-8x7b': { provider: 'local', strength: 'speed', cost: 0 },
            'phi-3-medium': { provider: 'local', strength: 'efficiency', cost: 0 }
        };
        
        this.strategies = {
            'best-quality': this.getBestQualityStrategy(),
            'cost-effective': this.getCostEffectiveStrategy(),
            'speed-optimized': this.getSpeedOptimizedStrategy(),
            'comprehensive': this.getComprehensiveStrategy(),
            'privacy-focused': this.getPrivacyFocusedStrategy()
        };
    }

    /**
     * Analyze content using the optimal AI strategy
     */
    async analyzeContent(content, options = {}) {
        const {
            strategy = 'best-quality',
            maxCost = 0.05,
            priority = 'quality',
            includeAttachments = true,
            detailLevel = 'detailed'
        } = options;

        try {
            // Step 1: Content preprocessing and analysis
            const preprocessed = await this.preprocessContent(content, includeAttachments);
            
            // Step 2: Select optimal models based on strategy
            const selectedModels = this.selectModels(strategy, preprocessed, maxCost);
            
            // Step 3: Parallel analysis with multiple models
            const analyses = await this.runParallelAnalysis(preprocessed, selectedModels);
            
            // Step 4: Synthesize results into final summary
            const finalSummary = await this.synthesizeResults(analyses, detailLevel);
            
            // Step 5: Quality validation and enhancement
            const validatedSummary = await this.validateAndEnhance(finalSummary, preprocessed);
            
            return {
                summary: validatedSummary,
                metadata: {
                    modelsUsed: selectedModels.map(m => m.name),
                    totalCost: this.calculateTotalCost(selectedModels, preprocessed),
                    processingTime: Date.now() - (options.startTime || Date.now()),
                    strategy: strategy,
                    confidence: this.calculateConfidence(analyses)
                }
            };
            
        } catch (error) {
            console.error('Multi-AI analysis failed:', error);
            // Fallback to single best available model
            return await this.fallbackAnalysis(content, options);
        }
    }

    /**
     * Preprocess content for optimal AI analysis
     */
    async preprocessContent(content, includeAttachments) {
        const processed = {
            text: this.extractAndCleanText(content),
            structure: this.analyzeStructure(content),
            attachments: includeAttachments ? await this.processAttachments(content.attachments) : [],
            metadata: this.extractMetadata(content),
            complexity: this.assessComplexity(content),
            language: this.detectLanguage(content)
        };

        return processed;
    }

    /**
     * Select optimal models based on strategy and content
     */
    selectModels(strategy, content, maxCost) {
        const strategyConfig = this.strategies[strategy];
        const availableModels = this.getAvailableModels();
        
        let selectedModels = [];
        
        switch (strategy) {
            case 'best-quality':
                selectedModels = this.selectBestQualityModels(availableModels, content, maxCost);
                break;
            case 'cost-effective':
                selectedModels = this.selectCostEffectiveModels(availableModels, content, maxCost);
                break;
            case 'speed-optimized':
                selectedModels = this.selectSpeedOptimizedModels(availableModels, content);
                break;
            case 'comprehensive':
                selectedModels = this.selectComprehensiveModels(availableModels, content, maxCost);
                break;
            case 'privacy-focused':
                selectedModels = this.selectPrivacyFocusedModels(availableModels, content);
                break;
        }

        return selectedModels;
    }

    /**
     * Run analysis with multiple models in parallel
     */
    async runParallelAnalysis(content, models) {
        const analysisPromises = models.map(async (model) => {
            try {
                const result = await this.analyzeWithModel(content, model);
                return {
                    model: model.name,
                    result: result,
                    success: true,
                    timestamp: Date.now()
                };
            } catch (error) {
                console.warn(`Analysis failed with ${model.name}:`, error);
                return {
                    model: model.name,
                    error: error.message,
                    success: false,
                    timestamp: Date.now()
                };
            }
        });

        const results = await Promise.allSettled(analysisPromises);
        return results
            .filter(r => r.status === 'fulfilled' && r.value.success)
            .map(r => r.value);
    }

    /**
     * Analyze content with a specific model
     */
    async analyzeWithModel(content, model) {
        const prompt = this.createOptimizedPrompt(content, model);
        
        switch (model.provider) {
            case 'openai':
                return await this.analyzeWithOpenAI(prompt, model);
            case 'anthropic':
                return await this.analyzeWithAnthropic(prompt, model);
            case 'google':
                return await this.analyzeWithGoogle(prompt, model);
            case 'cohere':
                return await this.analyzeWithCohere(prompt, model);
            case 'perplexity':
                return await this.analyzeWithPerplexity(prompt, model);
            case 'mistral':
                return await this.analyzeWithMistral(prompt, model);
            case 'local':
                return await this.analyzeWithLocal(prompt, model);
            default:
                throw new Error(`Unsupported provider: ${model.provider}`);
        }
    }

    /**
     * OpenAI API integration
     */
    async analyzeWithOpenAI(prompt, model) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKeys.openai}`
            },
            body: JSON.stringify({
                model: model.name,
                messages: [
                    {
                        role: 'system',
                        content: this.getSystemPrompt(model)
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 1000
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        return this.parseResponse(data.choices[0].message.content, model);
    }

    /**
     * Anthropic Claude API integration
     */
    async analyzeWithAnthropic(prompt, model) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKeys.anthropic,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model.name,
                max_tokens: 1000,
                messages: [
                    {
                        role: 'user',
                        content: this.getSystemPrompt(model) + '\n\n' + prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.statusText}`);
        }

        const data = await response.json();
        return this.parseResponse(data.content[0].text, model);
    }

    /**
     * Google Gemini API integration
     */
    async analyzeWithGoogle(prompt, model) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKeys.google
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: this.getSystemPrompt(model) + '\n\n' + prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Google API error: ${response.statusText}`);
        }

        const data = await response.json();
        return this.parseResponse(data.candidates[0].content.parts[0].text, model);
    }

    /**
     * Synthesize multiple AI results into final summary
     */
    async synthesizeResults(analyses, detailLevel) {
        if (analyses.length === 0) {
            throw new Error('No successful analyses to synthesize');
        }

        if (analyses.length === 1) {
            return analyses[0].result;
        }

        // Use the best available model to synthesize multiple results
        const synthesisPrompt = this.createSynthesisPrompt(analyses, detailLevel);
        const bestModel = this.selectBestSynthesisModel(analyses);
        
        return await this.analyzeWithModel({
            text: synthesisPrompt,
            structure: { type: 'synthesis' }
        }, bestModel);
    }

    /**
     * Strategy configurations
     */
    getBestQualityStrategy() {
        return {
            primaryModels: ['gpt-4o', 'claude-3-opus', 'gemini-1.5-pro'],
            fallbackModels: ['gpt-4o-mini', 'claude-3-sonnet'],
            synthesisModel: 'gpt-4o',
            maxCost: 0.05,
            parallel: true
        };
    }

    getCostEffectiveStrategy() {
        return {
            primaryModels: ['gpt-4o-mini', 'claude-3-haiku', 'gemini-1.5-flash'],
            fallbackModels: ['gpt-3.5-turbo', 'command-r'],
            synthesisModel: 'gpt-4o-mini',
            maxCost: 0.01,
            parallel: false
        };
    }

    getSpeedOptimizedStrategy() {
        return {
            primaryModels: ['gpt-4o-mini', 'claude-3-haiku'],
            fallbackModels: ['gpt-3.5-turbo'],
            synthesisModel: 'gpt-4o-mini',
            maxCost: 0.005,
            parallel: true,
            timeout: 5000
        };
    }

    getComprehensiveStrategy() {
        return {
            primaryModels: ['gpt-4o', 'claude-3-opus', 'gemini-1.5-pro', 'command-r-plus'],
            fallbackModels: ['gpt-4o-mini', 'claude-3-sonnet'],
            synthesisModel: 'gpt-4o',
            maxCost: 0.1,
            parallel: true,
            includeSpecialized: true
        };
    }

    getPrivacyFocusedStrategy() {
        return {
            primaryModels: ['llama-3.1-70b', 'mixtral-8x7b'],
            fallbackModels: ['phi-3-medium'],
            synthesisModel: 'llama-3.1-70b',
            maxCost: 0,
            parallel: true,
            localOnly: true
        };
    }

    /**
     * Helper methods
     */
    getAvailableModels() {
        return Object.keys(this.models).filter(modelName => {
            const model = this.models[modelName];
            return this.apiKeys[model.provider] || model.provider === 'local';
        });
    }

    calculateTotalCost(models, content) {
        const tokenCount = this.estimateTokenCount(content);
        return models.reduce((total, model) => {
            return total + (this.models[model.name].cost * tokenCount / 1000);
        }, 0);
    }

    calculateConfidence(analyses) {
        if (analyses.length === 0) return 0;
        if (analyses.length === 1) return 0.7;
        
        // Calculate consensus between different models
        const consensus = this.calculateConsensus(analyses);
        return Math.min(0.95, 0.5 + (consensus * 0.45));
    }

    /**
     * Fallback to single model analysis
     */
    async fallbackAnalysis(content, options) {
        const availableModels = this.getAvailableModels();
        if (availableModels.length === 0) {
            throw new Error('No AI models available');
        }

        const bestModel = this.selectBestAvailableModel(availableModels);
        const preprocessed = await this.preprocessContent(content, options.includeAttachments);
        const result = await this.analyzeWithModel(preprocessed, bestModel);

        return {
            summary: result,
            metadata: {
                modelsUsed: [bestModel.name],
                totalCost: this.calculateTotalCost([bestModel], preprocessed),
                processingTime: Date.now() - (options.startTime || Date.now()),
                strategy: 'fallback',
                confidence: 0.7
            }
        };
    }
}

// Export for use in applications
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiAIAnalyzer;
} else if (typeof window !== 'undefined') {
    window.MultiAIAnalyzer = MultiAIAnalyzer;
}

