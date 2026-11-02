/**
 * 3D Printing UI Handler
 * Manages form submission, file uploads, and quote display
 */

let print3DSystem;
let uploadedFiles = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Grokbot and 3D system to be available
    if (typeof GrokbotAssistant !== 'undefined' && typeof Print3DSystem !== 'undefined') {
        const grokbot = new GrokbotAssistant();
        grokbot.initialize().then(() => {
            print3DSystem = new Print3DSystem(grokbot);
            console.log('3D Printing System initialized');
        });
    }

    setupFormHandlers();
    setupFileUpload();
});

/**
 * Set up form event handlers
 */
function setupFormHandlers() {
    const form = document.getElementById('printRequestForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitPrintRequest();
    });
}

/**
 * Set up file upload functionality
 */
function setupFileUpload() {
    const uploadZone = document.getElementById('fileUploadZone');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadZone || !fileInput) return;

    // Click to upload
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

/**
 * Handle uploaded files
 */
function handleFiles(files) {
    const filesList = document.getElementById('uploadedFilesList');
    
    for (const file of files) {
        uploadedFiles.push(file);
        
        const fileItem = document.createElement('div');
        fileItem.className = 'uploaded-file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button type="button" class="file-remove" onclick="removeFile(${uploadedFiles.length - 1})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        filesList.appendChild(fileItem);
    }
}

/**
 * Remove uploaded file
 */
function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderUploadedFiles();
}

/**
 * Re-render uploaded files list
 */
function renderUploadedFiles() {
    const filesList = document.getElementById('uploadedFilesList');
    filesList.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'uploaded-file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button type="button" class="file-remove" onclick="removeFile(${index})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        filesList.appendChild(fileItem);
    });
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Submit print request
 */
async function submitPrintRequest() {
    const form = document.getElementById('printRequestForm');
    const formData = new FormData(form);
    
    // Convert FormData to object
    const requestData = {
        vehicle_make: formData.get('vehicle_make'),
        vehicle_model: formData.get('vehicle_model'),
        vehicle_year: formData.get('vehicle_year'),
        part_category: formData.get('part_category'),
        part_description: formData.get('part_description'),
        length: formData.get('length'),
        width: formData.get('width'),
        height: formData.get('height'),
        material: formData.get('material'),
        customer_name: formData.get('customer_name'),
        customer_phone: formData.get('customer_phone'),
        customer_email: formData.get('customer_email'),
        location: formData.get('location'),
        files: uploadedFiles
    };

    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
        </svg>
        Analyzing with AI...
    `;
    submitBtn.disabled = true;

    try {
        // Process request with AI
        const result = await print3DSystem.handlePrintRequest(requestData);

        if (result.success) {
            // Show quote modal
            displayQuote(result.quote);
        } else {
            // Show error
            alert(result.message);
        }
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Error processing request. Please try again or contact us directly.');
    } finally {
        // Restore button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

/**
 * Display quote modal
 */
function displayQuote(quote) {
    const modal = document.getElementById('quoteModal');
    const content = document.getElementById('quoteContent');

    const material = print3DSystem.materials[quote.material];

    content.innerHTML = `
        <div class="quote-header">
            <div class="quote-title">
                <h2>Your Custom Part Quote</h2>
                <div class="quote-id">Request ID: ${quote.requestId}</div>
            </div>
            <div class="quote-status">
                <span class="status-badge success">✓ Feasible</span>
            </div>
        </div>

        <div class="quote-body">
            <!-- Part Details -->
            <div class="quote-section">
                <h3>Part Details</h3>
                <div class="quote-details-grid">
                    <div class="quote-detail">
                        <span class="detail-label">Vehicle</span>
                        <span class="detail-value">${quote.vehicle_make} ${quote.vehicle_model} ${quote.vehicle_year || ''}</span>
                    </div>
                    <div class="quote-detail">
                        <span class="detail-label">Category</span>
                        <span class="detail-value">${formatCategory(quote.part_category)}</span>
                    </div>
                    <div class="quote-detail">
                        <span class="detail-label">Description</span>
                        <span class="detail-value">${quote.part_description}</span>
                    </div>
                </div>
            </div>

            <!-- Dimensions -->
            <div class="quote-section">
                <h3>Dimensions</h3>
                <div class="dimensions-display">
                    <div class="dimension-box">
                        <span class="dimension-label">Length</span>
                        <span class="dimension-value">${quote.dimensions.length}mm</span>
                    </div>
                    <div class="dimension-separator">×</div>
                    <div class="dimension-box">
                        <span class="dimension-label">Width</span>
                        <span class="dimension-value">${quote.dimensions.width}mm</span>
                    </div>
                    <div class="dimension-separator">×</div>
                    <div class="dimension-box">
                        <span class="dimension-label">Height</span>
                        <span class="dimension-value">${quote.dimensions.height}mm</span>
                    </div>
                </div>
                ${quote.dimensions.estimated ? 
                    '<p class="estimate-note">💡 Dimensions estimated by AI. We\'ll verify before printing.</p>' : 
                    ''
                }
            </div>

            <!-- Material & Specifications -->
            <div class="quote-section">
                <h3>Material & Specifications</h3>
                <div class="material-selected">
                    <div class="material-info">
                        <h4>${material.name}</h4>
                        <p>${material.description}</p>
                        <div class="material-specs">
                            <span>Strength: ${'⭐'.repeat(material.strength)}</span>
                            <span>Heat Resistance: ${'⭐'.repeat(material.heatResistance)}</span>
                        </div>
                    </div>
                    <div class="material-weight">
                        <strong>${quote.estimate.weight}g</strong>
                        <span>Material</span>
                    </div>
                </div>
            </div>

            <!-- Cost Breakdown -->
            <div class="quote-section">
                <h3>Cost Breakdown</h3>
                <div class="cost-breakdown">
                    <div class="cost-row">
                        <span>Material (${quote.estimate.weight}g ${material.name})</span>
                        <span>KSh ${quote.estimate.costs.material.toLocaleString()}</span>
                    </div>
                    <div class="cost-row">
                        <span>Printing Time (${quote.estimate.printTimeHours}h)</span>
                        <span>KSh ${(quote.estimate.costs.electricity + quote.estimate.costs.depreciation).toLocaleString()}</span>
                    </div>
                    <div class="cost-row">
                        <span>Quality Control & Finishing</span>
                        <span>KSh ${quote.estimate.costs.labor.toLocaleString()}</span>
                    </div>
                    <div class="cost-row subtotal">
                        <span>Base Cost</span>
                        <span>KSh ${quote.estimate.costs.base.toLocaleString()}</span>
                    </div>
                    <div class="cost-row total">
                        <span>Final Price</span>
                        <span>KSh ${quote.estimate.price.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="quote-section">
                <h3>Timeline</h3>
                <div class="timeline-display">
                    <div class="timeline-step">
                        <div class="timeline-icon">📝</div>
                        <div class="timeline-content">
                            <strong>Order Confirmation</strong>
                            <span>Immediate</span>
                        </div>
                    </div>
                    <div class="timeline-step">
                        <div class="timeline-icon">🖨️</div>
                        <div class="timeline-content">
                            <strong>Printing</strong>
                            <span>${quote.estimate.printTimeHours}h print time</span>
                        </div>
                    </div>
                    <div class="timeline-step">
                        <div class="timeline-icon">✅</div>
                        <div class="timeline-content">
                            <strong>Ready for Pickup</strong>
                            <span>${quote.estimate.estimatedDays}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Warnings (if any) -->
            ${quote.feasibility.warnings && quote.feasibility.warnings.length > 0 ? `
                <div class="quote-section warnings">
                    <h3>⚠️ Important Notes</h3>
                    <ul>
                        ${quote.feasibility.warnings.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            <!-- Actions -->
            <div class="quote-actions">
                <button class="btn btn-primary btn-large" onclick="approveQuote('${quote.requestId}')">
                    ✓ Approve & Order
                </button>
                <button class="btn btn-secondary" onclick="contactAboutQuote('${quote.requestId}')">
                    💬 Discuss Modifications
                </button>
                <button class="btn btn-outline" onclick="closeQuoteModal()">
                    Cancel
                </button>
            </div>

            <!-- Contact Info -->
            <div class="quote-footer">
                <p>Questions? Call us at <strong>+254 714 243 345</strong> (Embu & Garissa)</p>
                <p class="quote-validity">This quote is valid for 7 days</p>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

/**
 * Format category name
 */
function formatCategory(category) {
    const categories = {
        interior: 'Interior Trim & Panels',
        clips: 'Clips & Fasteners',
        handles: 'Handles, Knobs & Buttons',
        brackets: 'Brackets & Mounting Parts',
        custom: 'Custom/Other'
    };
    return categories[category] || category;
}

/**
 * Approve quote and place order
 */
async function approveQuote(requestId) {
    if (!confirm('Confirm order? You\'ll receive payment instructions via SMS.')) {
        return;
    }

    try {
        const order = await print3DSystem.approveQuote(requestId);
        
        // Show success message
        alert(
            `Order confirmed! Order #${order.orderId}\n\n` +
            `Your part will be ready in ${order.estimate.estimatedDays}.\n\n` +
            `Payment instructions sent to ${order.customer_phone}.\n\n` +
            `You'll receive updates via SMS and WhatsApp.`
        );
        
        closeQuoteModal();
        
        // Reset form
        document.getElementById('printRequestForm').reset();
        uploadedFiles = [];
        renderUploadedFiles();
        
    } catch (error) {
        alert('Error placing order. Please contact us directly.');
        console.error(error);
    }
}

/**
 * Contact about quote
 */
function contactAboutQuote(requestId) {
    const phone = '+254712345678';
    const message = `Hi, I have a quote (${requestId}) and I'd like to discuss modifications.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

/**
 * Close quote modal
 */
function closeQuoteModal() {
    document.getElementById('quoteModal').classList.remove('active');
}

/**
 * Scroll to request form
 */
function scrollToRequest() {
    document.getElementById('request-form').scrollIntoView({ behavior: 'smooth' });
}

// Add CSS for spinning animation
const style = document.createElement('style');
style.textContent = `
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
