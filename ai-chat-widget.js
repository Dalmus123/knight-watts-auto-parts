/**
 * AI Chat Widget Integration
 * Provides interactive chat interface with Grokbot
 */

class AIChatWidget {
    constructor(grokbot) {
        this.grokbot = grokbot;
        this.isOpen = false;
        this.messages = [];
        this.isTyping = false;
        this.unreadCount = 0;
        
        this.suggestions = [
            "I need brake pads",
            "Toyota parts",
            "Check prices",
            "Delivery to Garissa?",
            "M-Pesa payment?"
        ];
    }

    /**
     * Initialize and render the chat widget
     */
    initialize() {
        this.render();
        this.attachEventListeners();
        
        // Show welcome message after a delay
        setTimeout(() => {
            if (this.messages.length === 0) {
                this.showWelcomeMessage();
            }
        }, 2000);

        console.log('AI Chat Widget initialized');
    }

    /**
     * Render the chat widget HTML
     */
    render() {
        const widget = document.createElement('div');
        widget.className = 'ai-chat-widget minimized';
        widget.id = 'aiChatWidget';
        
        widget.innerHTML = `
            <div class="chat-header" onclick="chatWidget.toggleChat()">
                <div class="chat-header-left">
                    <div class="chat-bot-avatar">🤖</div>
                    <div class="chat-header-text">
                        <h3>AI Assistant</h3>
                        <div class="chat-status">
                            <span class="status-dot"></span>
                            <span>Online</span>
                        </div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-header-btn" onclick="event.stopPropagation(); chatWidget.clearChat()" title="Clear chat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    <button class="chat-header-btn" onclick="event.stopPropagation(); chatWidget.toggleChat()" title="Minimize">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="chat-messages" id="chatMessages">
                <!-- Messages will be added here -->
            </div>

            <div class="chat-suggestions" id="chatSuggestions">
                ${this.suggestions.map(s => 
                    `<button class="suggestion-chip" onclick="chatWidget.sendSuggestion('${s}')">${s}</button>`
                ).join('')}
            </div>

            <div class="chat-input-container">
                <div class="chat-input-wrapper">
                    <textarea 
                        id="chatInput" 
                        class="chat-input" 
                        placeholder="Ask me anything..." 
                        rows="1"
                        onkeydown="chatWidget.handleKeyDown(event)"
                    ></textarea>
                    <button class="chat-send-btn" id="chatSendBtn" onclick="chatWidget.sendMessage()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="chat-powered-by">
                Powered by <a href="#" target="_blank">Grokbot AI</a>
            </div>
        `;

        document.body.appendChild(widget);
        this.widget = widget;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Auto-resize textarea
        const input = document.getElementById('chatInput');
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });
    }

    /**
     * Toggle chat open/close
     */
    toggleChat() {
        this.isOpen = !this.isOpen;
        
        if (this.isOpen) {
            this.widget.classList.remove('minimized');
            this.unreadCount = 0;
            this.updateUnreadBadge();
            setTimeout(() => {
                document.getElementById('chatInput').focus();
                this.scrollToBottom();
            }, 100);
        } else {
            this.widget.classList.add('minimized');
        }
    }

    /**
     * Show welcome message
     */
    showWelcomeMessage() {
        const welcome = {
            role: 'bot',
            content: "👋 Habari! I'm your AI assistant. I can help you find car parts, check prices, answer technical questions, and more. How can I help you today?",
            timestamp: new Date()
        };
        
        this.addMessage(welcome);
        
        // Show notification if chat is closed
        if (!this.isOpen) {
            this.unreadCount++;
            this.updateUnreadBadge();
        }
    }

    /**
     * Send a message
     */
    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message
        this.addMessage({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        // Clear input
        input.value = '';
        input.style.height = 'auto';

        // Show typing indicator
        this.showTyping();

        // Get context
        const context = this.getContext();

        // Get AI response
        try {
            const response = await this.grokbot.chat(message, context);
            
            // Hide typing indicator
            this.hideTyping();
            
            // Add bot response
            this.addMessage({
                role: 'bot',
                content: response,
                timestamp: new Date()
            });

            // Update suggestions based on intent
            await this.updateSuggestions(message);

        } catch (error) {
            this.hideTyping();
            this.addMessage({
                role: 'bot',
                content: "Sorry, I'm having trouble connecting. Please try again or call us at +254 712 345 678.",
                timestamp: new Date(),
                isError: true
            });
        }
    }

    /**
     * Send a suggested message
     */
    sendSuggestion(suggestion) {
        document.getElementById('chatInput').value = suggestion;
        this.sendMessage();
    }

    /**
     * Add a message to the chat
     */
    addMessage(message) {
        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    /**
     * Render a single message
     */
    renderMessage(message) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.role}`;
        
        const time = this.formatTime(message.timestamp);
        
        messageDiv.innerHTML = `
            <div class="message-avatar ${message.role}">
                ${message.role === 'bot' ? '🤖' : '👤'}
            </div>
            <div class="message-content">
                ${this.formatMessageContent(message.content)}
                <div class="message-time">${time}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
    }

    /**
     * Format message content (support for markdown-like formatting)
     */
    formatMessageContent(content) {
        // Convert **bold** to <strong>
        content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Convert line breaks
        content = content.replace(/\n/g, '<br>');
        
        // Convert bullet points
        content = content.replace(/^• /gm, '&bull; ');
        
        return content;
    }

    /**
     * Format timestamp
     */
    formatTime(date) {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Show typing indicator
     */
    showTyping() {
        this.isTyping = true;
        const messagesContainer = document.getElementById('chatMessages');
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-message bot';
        typingDiv.id = 'typingIndicator';
        
        typingDiv.innerHTML = `
            <div class="message-avatar bot">🤖</div>
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        
        messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    /**
     * Hide typing indicator
     */
    hideTyping() {
        this.isTyping = false;
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    }

    /**
     * Get context from current page state
     */
    getContext() {
        const context = {};
        
        // Get current location
        if (window.currentLocation) {
            context.location = window.currentLocation;
        }
        
        // Get cart items
        if (window.cart && window.cart.length > 0) {
            context.cartItems = window.cart.length;
        }
        
        // Get currently viewed product (if in modal)
        if (window.selectedProduct) {
            context.currentProduct = window.selectedProduct;
        }
        
        // Get recent search query
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value) {
            context.searchQuery = searchInput.value;
        }
        
        return context;
    }

    /**
     * Update suggestions based on conversation
     */
    async updateSuggestions(lastMessage) {
        const intent = await this.grokbot.analyzeIntent(lastMessage);
        
        const suggestionsMap = {
            search: [
                "Show me more",
                "Check stock in Embu",
                "Check stock in Garissa",
                "What's the price?",
                "Add to cart"
            ],
            price: [
                "Any discounts?",
                "Compare with similar",
                "Is delivery included?",
                "What payment methods?"
            ],
            availability: [
                "When will you restock?",
                "Alternative products?",
                "Can I pre-order?",
                "Notify me when available"
            ],
            support: [
                "Common symptoms?",
                "Installation guide",
                "Warranty info",
                "Speak to human"
            ],
            delivery: [
                "Delivery cost?",
                "Track my order",
                "Change delivery address",
                "Urgent delivery?"
            ]
        };
        
        const newSuggestions = suggestionsMap[intent.intent] || this.suggestions;
        
        // Update suggestions UI
        const suggestionsContainer = document.getElementById('chatSuggestions');
        suggestionsContainer.innerHTML = newSuggestions.map(s => 
            `<button class="suggestion-chip" onclick="chatWidget.sendSuggestion('${s}')">${s}</button>`
        ).join('');
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        // Send on Enter (without Shift)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    /**
     * Clear chat history
     */
    clearChat() {
        if (confirm('Clear chat history?')) {
            this.messages = [];
            document.getElementById('chatMessages').innerHTML = '';
            this.grokbot.clearHistory();
            this.showWelcomeMessage();
        }
    }

    /**
     * Update unread badge
     */
    updateUnreadBadge() {
        let badge = this.widget.querySelector('.chat-notification');
        
        if (this.unreadCount > 0) {
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'chat-notification';
                this.widget.querySelector('.chat-header').appendChild(badge);
            }
            badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        } else {
            if (badge) {
                badge.remove();
            }
        }
    }

    /**
     * Show notification when chat is minimized
     */
    showNotification(message) {
        if (!this.isOpen) {
            this.unreadCount++;
            this.updateUnreadBadge();
            
            // Could add browser notification here if permissions granted
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('AutoPartsKE AI Assistant', {
                    body: message.substring(0, 100),
                    icon: '/favicon.ico'
                });
            }
        }
    }
}

// Initialize when DOM is ready
let chatWidget;

document.addEventListener('DOMContentLoaded', () => {
    // Wait for Grokbot to be available
    if (typeof GrokbotAssistant !== 'undefined') {
        const grokbot = new GrokbotAssistant({
            // apiKey: 'YOUR_API_KEY_HERE' // Add API key for production
        });
        
        grokbot.initialize().then(() => {
            chatWidget = new AIChatWidget(grokbot);
            chatWidget.initialize();
            
            // Make globally available
            window.chatWidget = chatWidget;
            window.grokbot = grokbot;
        });
    } else {
        console.error('Grokbot not loaded. Make sure grokbot.js is included before ai-chat-widget.js');
    }
});
