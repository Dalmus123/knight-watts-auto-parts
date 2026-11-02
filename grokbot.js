/**
 * Grokbot AI Assistant for Knight Watts Auto Parts
 * Provides intelligent customer support, product recommendations, and automation
 */

class GrokbotAssistant {
    constructor(config = {}) {
        this.apiKey = config.apiKey || null;
        this.endpoint = config.endpoint || 'https://api.x.ai/v1/chat';
        this.fallbackEndpoint = 'https://api.openai.com/v1/chat/completions';
        this.conversationHistory = [];
        this.products = window.products || [];
        this.maxHistoryLength = 20;
        this.isDemo = !this.apiKey; // Demo mode if no API key
        
        this.systemPrompt = `You are an AI assistant for Knight Watts Auto Parts, a subsidiary of Knight Watts Energy Solutions Limited. We're an innovative car spare parts business in Kenya with locations in Embu and Garissa.

Your role and capabilities:
1. Help customers find the right car parts for their vehicles
2. Answer technical questions about cars and parts
3. Check product availability and pricing
4. Provide installation guidance and troubleshooting
5. Process inquiries in English and Swahili
6. Be friendly, professional, and helpful

Business information:
- Locations: Embu (1,200+ parts in stock) and Garissa (800+ parts in stock)
- Payment methods: M-Pesa, Bank Transfer, Cash on Delivery
- Delivery: 1-2 days within town, 2-3 days inter-city
- Phone: +254 714 243 345 (Embu & Garissa)
- Operating hours: Mon-Sat 8AM-6PM

Common Kenyan vehicle makes: Toyota, Nissan, Mitsubishi, Mazda, Suzuki, Honda
Product categories: Engine Parts, Brakes & Suspension, Electrical, Body Parts, Filters & Fluids

Always:
- Check product availability before confirming
- Provide KES prices
- Mention location-specific stock
- Suggest compatible products
- Be concise but helpful
- Use Swahili when customer uses it

Never:
- Make promises about products not in catalog
- Give medical or safety advice beyond general car safety
- Share personal data of other customers`;
    }

    /**
     * Initialize the AI assistant
     */
    async initialize() {
        console.log('Grokbot initialized in', this.isDemo ? 'DEMO' : 'API', 'mode');
        
        if (this.isDemo) {
            console.log('💡 Tip: Add API key to enable real AI responses');
        }
        
        return true;
    }

    /**
     * Main chat function - sends message and gets AI response
     */
    async chat(userMessage, context = {}) {
        if (!userMessage || userMessage.trim() === '') {
            return "Please enter a message.";
        }

        // In demo mode, use rule-based responses
        if (this.isDemo) {
            return this.getDemoResponse(userMessage, context);
        }

        try {
            const enrichedMessage = this.enrichMessage(userMessage, context);
            
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'grok-beta',
                    messages: [
                        { role: 'system', content: this.systemPrompt },
                        ...this.conversationHistory,
                        { role: 'user', content: enrichedMessage }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const botReply = data.choices[0].message.content;

            // Update conversation history
            this.addToHistory('user', userMessage);
            this.addToHistory('assistant', botReply);

            return botReply;

        } catch (error) {
            console.error('Grokbot error:', error);
            return this.getFallbackResponse(userMessage, context);
        }
    }

    /**
     * Enrich user message with context
     */
    enrichMessage(message, context) {
        let enriched = message;
        const contextInfo = [];
        
        if (context.currentProduct) {
            contextInfo.push(`Viewing: ${context.currentProduct.name} (KSh ${context.currentProduct.price})`);
        }
        
        if (context.location) {
            contextInfo.push(`Location: ${context.location}`);
        }
        
        if (context.cartItems && context.cartItems > 0) {
            contextInfo.push(`Cart: ${context.cartItems} items`);
        }

        if (context.searchQuery) {
            contextInfo.push(`Recent search: "${context.searchQuery}"`);
        }
        
        if (contextInfo.length > 0) {
            enriched += `\n\n[Context: ${contextInfo.join(' | ')}]`;
        }
        
        return enriched;
    }

    /**
     * Add message to conversation history
     */
    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
        
        // Keep only recent history to manage token usage
        if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
        }
    }

    /**
     * Demo mode responses (no API key needed)
     */
    getDemoResponse(message, context) {
        const msgLower = message.toLowerCase();
        
        // Swahili greetings
        if (msgLower.match(/habari|mambo|niaje|sasa/)) {
            return "Habari! 👋 Karibu Knight Watts Auto Parts. Ninaweza kukusaidia vipi leo? I can help you find car parts, check prices, or answer questions about your vehicle.";
        }

        // Product search
        if (msgLower.match(/need|want|looking for|ninahitaji|nataka/)) {
            const results = this.searchProducts(message);
            if (results.length > 0) {
                let response = `I found ${results.length} products that might help:\n\n`;
                results.slice(0, 3).forEach((p, i) => {
                    response += `${i + 1}. **${p.name}** - KSh ${p.price.toLocaleString()}\n`;
                    response += `   ${p.description.substring(0, 60)}...\n`;
                    response += `   Stock: Embu (${p.locations.embu.stock}), Garissa (${p.locations.garissa.stock})\n\n`;
                });
                response += "Would you like more details on any of these?";
                return response;
            }
            return "I'd be happy to help you find parts! Could you tell me more about what you're looking for? What's your vehicle make and model?";
        }

        // Price inquiry
        if (msgLower.match(/price|cost|bei|how much/)) {
            return "Our parts range from KSh 800 (filters) to KSh 15,000 (radiators). What specific part are you interested in? I can give you exact pricing and check availability in Embu or Garissa.";
        }

        // Stock/availability
        if (msgLower.match(/stock|available|have|iko wapi|iko/)) {
            if (context.location) {
                return `In ${context.location}, we have ${context.location === 'embu' ? '1,200+' : '800+'} parts in stock. What specific part would you like me to check for you?`;
            }
            return "We have stock in both Embu (1,200+ parts) and Garissa (800+ parts). Which location is more convenient for you? I can check specific availability.";
        }

        // Delivery
        if (msgLower.match(/deliver|shipping|peleka|transport/)) {
            return "🚚 **Delivery Options:**\n\n" +
                   "• Within town: 1-2 days (KSh 200-500)\n" +
                   "• Embu ↔ Garissa: 2-3 days (KSh 500-1,000)\n" +
                   "• Cash on delivery available\n" +
                   "• Free delivery on orders over KSh 20,000!\n\n" +
                   "Where should we deliver?";
        }

        // Payment
        if (msgLower.match(/payment|pay|mpesa|m-pesa|lipa/)) {
            return "💳 **Payment Methods:**\n\n" +
                   "1. **M-Pesa** (Fastest!) - Paybill coming soon\n" +
                   "2. **Bank Transfer** - Equity, KCB, Co-op\n" +
                   "3. **Cash on Delivery**\n\n" +
                   "M-Pesa is most popular and gets you faster delivery! Which would you prefer?";
        }

        // Technical help
        if (msgLower.match(/problem|issue|not working|help|shida|breakdown/)) {
            return "🔧 I can help with common car issues!\n\n" +
                   "Tell me what's happening:\n" +
                   "• Strange noises?\n" +
                   "• Warning lights?\n" +
                   "• Performance issues?\n" +
                   "• Something else?\n\n" +
                   "Describe the problem and I'll suggest what parts might help.";
        }

        // Location question
        if (msgLower.match(/location|address|wapi|mahali|where/)) {
            return "📍 **Our Locations:**\n\n" +
                   "**Embu Branch**\n" +
                   "Moi Avenue, Embu Town\n" +
                   "Next to Embu Level 5 Hospital\n" +
                   "📞 +254 714 243 345\n\n" +
                   "**Garissa Branch**\n" +
                   "Garissa Town Center\n" +
                   "Opposite County Government Offices\n" +
                   "📞 +254 714 243 345\n\n" +
                   "Open Mon-Sat: 8AM-6PM";
        }

        // Toyota specific (most common in Kenya)
        if (msgLower.match(/toyota/)) {
            const toyotaParts = this.products.filter(p => p.make === 'toyota');
            return `We have ${toyotaParts.length} Toyota parts available! Popular items:\n\n` +
                   "• Brake Pads - KSh 3,500\n" +
                   "• Alternator - KSh 12,500\n" +
                   "• Timing Belt Kit - KSh 4,500\n" +
                   "• Battery 12V 70Ah - KSh 9,500\n\n" +
                   "Which Toyota model do you have? (Corolla, Fielder, Vitz, Passo, etc.)";
        }

        // Nissan
        if (msgLower.match(/nissan/)) {
            return "We stock many Nissan parts! Popular for:\n" +
                   "• X-Trail, Note, Tiida\n" +
                   "• Wingroad, AD, March\n\n" +
                   "What part do you need? I can check exact compatibility and pricing.";
        }

        // Recommendation request
        if (msgLower.match(/recommend|suggest|best|quality/)) {
            return "Based on Kenyan conditions, I recommend:\n\n" +
                   "**Essential Maintenance:**\n" +
                   "1. Quality oil filters (change every 5,000km)\n" +
                   "2. Air filters (dusty roads!)\n" +
                   "3. Good brake pads (safety first)\n\n" +
                   "What's your vehicle make? I can give specific recommendations.";
        }

        // Thank you
        if (msgLower.match(/thank|asante|shukran/)) {
            return "Karibu sana! 😊 Happy to help. Feel free to ask anything else or call us at +254 714 243 345. Drive safe!";
        }

        // Default intelligent response
        return this.getIntelligentDefault(message, context);
    }

    /**
     * Intelligent default response based on context
     */
    getIntelligentDefault(message, context) {
        let response = "I'm here to help! ";

        if (context.currentProduct) {
            response += `I see you're looking at the ${context.currentProduct.name}. `;
        }

        response += "I can help you with:\n\n" +
                   "🔍 Finding the right parts\n" +
                   "💰 Checking prices and availability\n" +
                   "🚚 Delivery options\n" +
                   "🔧 Technical advice\n" +
                   "💳 Payment methods\n\n" +
                   "What would you like to know?";

        return response;
    }

    /**
     * Search products based on query
     */
    searchProducts(query) {
        const queryLower = query.toLowerCase();
        const keywords = queryLower.split(/\s+/);
        
        return this.products.filter(product => {
            const searchText = `${product.name} ${product.description} ${product.category} ${product.make}`.toLowerCase();
            return keywords.some(keyword => searchText.includes(keyword));
        }).sort((a, b) => {
            // Prioritize by relevance (name matches first)
            const aNameMatch = keywords.some(k => a.name.toLowerCase().includes(k));
            const bNameMatch = keywords.some(k => b.name.toLowerCase().includes(k));
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
            return 0;
        });
    }

    /**
     * Analyze user intent
     */
    async analyzeIntent(message) {
        const msgLower = message.toLowerCase();
        
        const intents = {
            search: ['looking for', 'need', 'want', 'searching', 'ninahitaji', 'nataka'],
            price: ['cost', 'price', 'bei', 'how much', 'ngapi'],
            availability: ['stock', 'available', 'have', 'iko', 'una'],
            support: ['help', 'problem', 'issue', 'not working', 'shida', 'breakdown'],
            delivery: ['deliver', 'shipping', 'peleka', 'transport', 'send'],
            payment: ['pay', 'mpesa', 'm-pesa', 'lipa', 'payment'],
            compare: ['difference', 'compare', 'better', 'vs', 'which'],
            location: ['where', 'address', 'wapi', 'mahali', 'location'],
            greeting: ['hi', 'hello', 'habari', 'mambo', 'sasa', 'niaje']
        };

        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(kw => msgLower.includes(kw))) {
                return {
                    intent,
                    confidence: 0.8,
                    keywords: keywords.filter(kw => msgLower.includes(kw))
                };
            }
        }

        return { intent: 'general', confidence: 0.5, keywords: [] };
    }

    /**
     * Get product recommendations based on vehicle or current product
     */
    async getRecommendations(criteria = {}) {
        let recommendations = [...this.products];

        // Filter by make if specified
        if (criteria.make) {
            recommendations = recommendations.filter(p => 
                p.make === criteria.make || p.make === 'universal'
            );
        }

        // Filter by category
        if (criteria.category) {
            recommendations = recommendations.filter(p => 
                p.category === criteria.category
            );
        }

        // If viewing a product, recommend related items
        if (criteria.currentProduct) {
            const current = criteria.currentProduct;
            recommendations = recommendations.filter(p => 
                p.id !== current.id && 
                (p.category === current.category || p.make === current.make)
            );
        }

        // Sort by relevance and return top 3
        return recommendations.slice(0, 3);
    }

    /**
     * Fallback response when API fails
     */
    getFallbackResponse(message, context) {
        console.log('Using fallback response');
        return this.getDemoResponse(message, context);
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
        console.log('Conversation history cleared');
    }

    /**
     * Get conversation summary
     */
    getSummary() {
        return {
            messageCount: this.conversationHistory.length,
            mode: this.isDemo ? 'demo' : 'api',
            hasApiKey: !!this.apiKey
        };
    }

    /**
     * Check if specific product is in stock at location
     */
    checkStock(productId, location) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return null;
        
        const locationStock = product.locations[location];
        return {
            available: locationStock.available && locationStock.stock > 0,
            quantity: locationStock.stock,
            status: locationStock.stock === 0 ? 'out_of_stock' :
                    locationStock.stock < 5 ? 'low_stock' : 'in_stock'
        };
    }

    /**
     * Format price in Kenyan Shillings
     */
    formatPrice(amount) {
        return `KSh ${amount.toLocaleString()}`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GrokbotAssistant;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.GrokbotAssistant = GrokbotAssistant;
}
