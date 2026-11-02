/**
 * 3D Printing System for AutoPartsKE
 * Handles custom part requests, AI analysis, quote generation, and print queue management
 */

class Print3DSystem {
    constructor(grokbot) {
        this.grokbot = grokbot;
        this.printers = [];
        this.printQueue = [];
        this.materials = this.initializeMaterials();
        this.loadPrinters();
    }

    /**
     * Initialize material database
     */
    initializeMaterials() {
        return {
            pla: {
                name: 'PLA',
                costPerKg: 1200,
                strength: 3,
                heatResistance: 1,
                flexibility: 1,
                maxTemp: 60,
                description: 'Good for interior trim, decorative parts',
                printTemp: 200,
                bedTemp: 60
            },
            petg: {
                name: 'PETG',
                costPerKg: 1500,
                strength: 4,
                heatResistance: 3,
                flexibility: 2,
                maxTemp: 80,
                description: 'Strong, durable, heat-resistant (Recommended)',
                printTemp: 235,
                bedTemp: 80
            },
            abs: {
                name: 'ABS',
                costPerKg: 1800,
                strength: 4,
                heatResistance: 4,
                flexibility: 2,
                maxTemp: 100,
                description: 'High heat resistance, very durable',
                printTemp: 240,
                bedTemp: 100
            },
            tpu: {
                name: 'TPU (Flexible)',
                costPerKg: 2500,
                strength: 3,
                heatResistance: 2,
                flexibility: 5,
                maxTemp: 70,
                description: 'Flexible, great for gaskets and seals',
                printTemp: 220,
                bedTemp: 50
            },
            nylon: {
                name: 'Nylon',
                costPerKg: 3000,
                strength: 5,
                heatResistance: 4,
                flexibility: 3,
                maxTemp: 90,
                description: 'Very strong, for high-stress parts',
                printTemp: 250,
                bedTemp: 80
            }
        };
    }

    /**
     * Load available 3D printers
     */
    loadPrinters() {
        // This would be loaded from database in production
        this.printers = [
            {
                id: 1,
                name: 'Bambu P1S #1',
                model: 'Bambu Lab P1S',
                location: 'embu',
                status: 'idle',
                buildVolume: { x: 256, y: 256, z: 256 },
                materials: ['pla', 'petg', 'abs'],
                currentJob: null,
                totalPrintTime: 0,
                successRate: 98
            },
            {
                id: 2,
                name: 'Bambu P1S #2',
                model: 'Bambu Lab P1S',
                location: 'embu',
                status: 'idle',
                buildVolume: { x: 256, y: 256, z: 256 },
                materials: ['pla', 'petg', 'abs'],
                currentJob: null,
                totalPrintTime: 0,
                successRate: 97
            },
            {
                id: 3,
                name: 'Ender 3 V3',
                model: 'Creality Ender 3 V3',
                location: 'garissa',
                status: 'idle',
                buildVolume: { x: 220, y: 220, z: 250 },
                materials: ['pla', 'petg'],
                currentJob: null,
                totalPrintTime: 0,
                successRate: 95
            }
        ];
    }

    /**
     * Handle new print request from customer
     */
    async handlePrintRequest(requestData) {
        console.log('Processing 3D print request:', requestData);

        try {
            // Step 1: AI analyzes feasibility
            const feasibility = await this.analyzeFeasibility(requestData);

            if (!feasibility.printable) {
                return {
                    success: false,
                    message: feasibility.reason,
                    alternative: feasibility.alternative
                };
            }

            // Step 2: Estimate dimensions if not provided
            let dimensions = requestData.dimensions;
            if (!dimensions || !dimensions.length) {
                dimensions = await this.estimateDimensions(requestData);
            }

            // Step 3: AI selects optimal material
            let material = requestData.material;
            if (material === 'ai_suggest' || !material) {
                material = await this.selectOptimalMaterial(requestData, dimensions);
            }

            // Step 4: Calculate cost and time
            const estimate = this.calculateEstimate(dimensions, material);

            // Step 5: Generate quote
            const quote = {
                requestId: this.generateRequestId(),
                ...requestData,
                feasibility,
                dimensions,
                material,
                estimate,
                createdAt: new Date(),
                status: 'quoted'
            };

            // Step 6: Store quote
            await this.storeQuote(quote);

            return {
                success: true,
                quote,
                message: 'Quote generated successfully!'
            };

        } catch (error) {
            console.error('Error processing print request:', error);
            return {
                success: false,
                message: 'Error processing request. Please try again or contact us.',
                error: error.message
            };
        }
    }

    /**
     * AI analyzes if part is feasible to print
     */
    async analyzeFeasibility(requestData) {
        const description = requestData.part_description;
        const category = requestData.part_category;

        // Safety check for critical parts
        const criticalKeywords = [
            'brake', 'steering', 'suspension', 'airbag', 'seatbelt',
            'wheel hub', 'axle', 'engine mount', 'transmission'
        ];

        const isCritical = criticalKeywords.some(keyword => 
            description.toLowerCase().includes(keyword)
        );

        if (isCritical) {
            return {
                printable: false,
                reason: 'Safety-critical component. We cannot 3D print parts that affect vehicle safety.',
                alternative: 'We recommend purchasing OEM parts for this component. Check our regular catalog.',
                confidence: 100
            };
        }

        // AI analyzes feasibility
        const prompt = `
        Customer wants to 3D print a car part:
        
        Description: "${description}"
        Category: ${category}
        Vehicle: ${requestData.vehicle_make} ${requestData.vehicle_model} ${requestData.vehicle_year || ''}
        
        Analyze:
        1. Is this safe and appropriate for 3D printing?
        2. Will a 3D printed version function adequately?
        3. What material would work best?
        4. Any concerns or warnings?
        5. Estimated print complexity (1-10)
        
        Respond with assessment of printability.
        `;

        try {
            const analysis = await this.grokbot.chat(prompt);
            return this.parseFeasibilityResponse(analysis, description);
        } catch (error) {
            // Fallback to rule-based analysis
            return this.fallbackFeasibilityCheck(requestData);
        }
    }

    /**
     * Parse AI feasibility response
     */
    parseFeasibilityResponse(aiResponse, description) {
        const response = aiResponse.toLowerCase();
        
        // Check for negative indicators
        const negative = ['cannot', 'not recommended', 'unsafe', 'not suitable', 'avoid'];
        const hasNegative = negative.some(word => response.includes(word));

        if (hasNegative) {
            return {
                printable: false,
                reason: 'Not suitable for 3D printing based on safety or functionality concerns.',
                alternative: 'Consider purchasing the OEM part.',
                confidence: 80
            };
        }

        // Extract complexity
        const complexityMatch = response.match(/complexity[:\s]+(\d+)/i);
        const complexity = complexityMatch ? parseInt(complexityMatch[1]) : 5;

        return {
            printable: true,
            confidence: 90,
            complexity,
            notes: aiResponse,
            warnings: this.extractWarnings(aiResponse)
        };
    }

    /**
     * Fallback feasibility check (rule-based)
     */
    fallbackFeasibilityCheck(requestData) {
        const safeCategories = ['interior', 'clips', 'handles', 'brackets', 'custom'];
        
        if (!safeCategories.includes(requestData.part_category)) {
            return {
                printable: false,
                reason: 'Part category requires professional assessment.',
                alternative: 'Please contact us for manual quote.',
                confidence: 70
            };
        }

        return {
            printable: true,
            confidence: 75,
            complexity: 5,
            notes: 'Part appears suitable for 3D printing.',
            warnings: ['Please verify fit before installation']
        };
    }

    /**
     * Estimate dimensions from description/photos
     */
    async estimateDimensions(requestData) {
        // If customer provided dimensions, use those
        if (requestData.length && requestData.width && requestData.height) {
            return {
                length: parseFloat(requestData.length),
                width: parseFloat(requestData.width),
                height: parseFloat(requestData.height),
                estimated: false
            };
        }

        // AI estimates dimensions based on description
        const prompt = `
        Estimate dimensions for this car part:
        "${requestData.part_description}"
        
        Vehicle: ${requestData.vehicle_make} ${requestData.vehicle_model}
        Category: ${requestData.part_category}
        
        Provide estimated dimensions in millimeters (length × width × height).
        Base estimates on typical automotive part sizes.
        `;

        try {
            const estimation = await this.grokbot.chat(prompt);
            return this.parseDimensionEstimate(estimation);
        } catch (error) {
            // Fallback to typical sizes by category
            return this.getTypicalDimensions(requestData.part_category);
        }
    }

    /**
     * Parse dimension estimate from AI
     */
    parseDimensionEstimate(aiResponse) {
        // Try to extract numbers
        const numbers = aiResponse.match(/\d+/g);
        
        if (numbers && numbers.length >= 3) {
            return {
                length: parseInt(numbers[0]),
                width: parseInt(numbers[1]),
                height: parseInt(numbers[2]),
                estimated: true,
                confidence: 'AI estimated'
            };
        }

        // Fallback
        return {
            length: 100,
            width: 50,
            height: 30,
            estimated: true,
            confidence: 'Generic estimate'
        };
    }

    /**
     * Get typical dimensions by category
     */
    getTypicalDimensions(category) {
        const typical = {
            interior: { length: 150, width: 100, height: 50 },
            clips: { length: 30, width: 20, height: 15 },
            handles: { length: 120, width: 40, height: 30 },
            brackets: { length: 80, width: 60, height: 40 },
            custom: { length: 100, width: 80, height: 50 }
        };

        return {
            ...typical[category] || typical.custom,
            estimated: true,
            confidence: 'Category-based estimate'
        };
    }

    /**
     * AI selects optimal material
     */
    async selectOptimalMaterial(requestData, dimensions) {
        const prompt = `
        Select best 3D printing material for:
        "${requestData.part_description}"
        
        Category: ${requestData.part_category}
        Location in car: ${this.inferLocation(requestData.part_description)}
        
        Materials available:
        - PLA: Economical, good for interior trim
        - PETG: Strong, heat-resistant (80°C)
        - ABS: Very durable, high heat (100°C)
        - TPU: Flexible, for gaskets/seals
        - Nylon: Strongest, for high-stress parts
        
        Consider:
        - Heat exposure
        - Mechanical stress
        - Flexibility needs
        - Cost-effectiveness
        
        Respond with just the material name (PLA, PETG, ABS, TPU, or Nylon).
        `;

        try {
            const suggestion = await this.grokbot.chat(prompt);
            const material = suggestion.toLowerCase().trim();
            
            // Validate suggestion
            if (this.materials[material]) {
                return material;
            }
            
            // Extract material name from response
            for (const mat of Object.keys(this.materials)) {
                if (suggestion.toLowerCase().includes(mat)) {
                    return mat;
                }
            }
        } catch (error) {
            console.error('Material selection failed, using default');
        }

        // Fallback to PETG (best general-purpose)
        return 'petg';
    }

    /**
     * Infer part location from description
     */
    inferLocation(description) {
        const desc = description.toLowerCase();
        
        if (desc.includes('dashboard') || desc.includes('interior')) return 'interior';
        if (desc.includes('engine') || desc.includes('hood')) return 'engine_bay';
        if (desc.includes('door')) return 'door';
        if (desc.includes('trunk') || desc.includes('boot')) return 'trunk';
        
        return 'general';
    }

    /**
     * Calculate cost and time estimate
     */
    calculateEstimate(dimensions, material) {
        // Calculate volume in cubic cm
        const volume = (dimensions.length * dimensions.width * dimensions.height) / 1000;
        
        // Estimate weight (assuming 20% infill, typical for functional parts)
        const density = 1.25; // g/cm³ average for PLA/PETG/ABS
        const infill = 0.20;
        const weight = volume * density * infill;

        // Material cost
        const materialData = this.materials[material];
        const materialCost = (weight / 1000) * materialData.costPerKg;

        // Print time estimation (very rough)
        const layerHeight = 0.2; // mm
        const layers = dimensions.height / layerHeight;
        const areaPerLayer = (dimensions.length * dimensions.width) / 100; // cm²
        const speedMmPerSec = 50; // conservative
        const minutesPerLayer = areaPerLayer / (speedMmPerSec * 0.06);
        const printTimeHours = (layers * minutesPerLayer) / 60;

        // Operating costs
        const powerConsumption = 0.3; // kW
        const electricityRate = 20; // KSh per kWh
        const electricityCost = printTimeHours * powerConsumption * electricityRate;

        // Depreciation
        const printerCost = 200000; // KSh
        const expectedLifetime = 5000; // hours
        const depreciationCost = (printTimeHours / expectedLifetime) * printerCost;

        // Labor cost
        const laborCost = 250; // Setup, removal, QC

        // Total base cost
        const baseCost = materialCost + electricityCost + depreciationCost + laborCost;

        // Markup (2.5-4x depending on complexity and size)
        const markup = this.calculateMarkup(dimensions, printTimeHours);
        const sellingPrice = baseCost * markup;

        // Minimum price
        const minimumPrice = 500;
        const finalPrice = Math.max(sellingPrice, minimumPrice);

        return {
            volume,
            weight: Math.round(weight),
            printTimeHours: Math.round(printTimeHours * 10) / 10,
            costs: {
                material: Math.round(materialCost),
                electricity: Math.round(electricityCost),
                depreciation: Math.round(depreciationCost),
                labor: laborCost,
                base: Math.round(baseCost)
            },
            markup,
            price: Math.round(finalPrice / 50) * 50, // Round to nearest 50
            materialUsed: `${Math.round(weight)}g ${materialData.name}`,
            estimatedDays: this.estimateDays(printTimeHours)
        };
    }

    /**
     * Calculate markup based on complexity
     */
    calculateMarkup(dimensions, printTime) {
        let markup = 2.5; // Base markup

        // Larger parts get lower markup
        const volume = dimensions.length * dimensions.width * dimensions.height;
        if (volume > 500000) markup = 2.2;
        if (volume > 1000000) markup = 2.0;

        // Longer prints get lower markup
        if (printTime > 20) markup -= 0.3;
        if (printTime > 40) markup -= 0.5;

        // Minimum markup
        markup = Math.max(markup, 1.8);

        return markup;
    }

    /**
     * Estimate delivery days
     */
    estimateDays(printTimeHours) {
        if (printTimeHours < 6) return '24 hours';
        if (printTimeHours < 12) return '24-36 hours';
        if (printTimeHours < 24) return '1-2 days';
        if (printTimeHours < 48) return '2-3 days';
        return '3-5 days';
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return 'PR' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    /**
     * Store quote in database/localStorage
     */
    async storeQuote(quote) {
        // In production, save to database
        // For now, store in localStorage
        const quotes = JSON.parse(localStorage.getItem('printQuotes') || '[]');
        quotes.push(quote);
        localStorage.setItem('printQuotes', JSON.stringify(quotes));
        
        console.log('Quote stored:', quote.requestId);
    }

    /**
     * Customer approves quote and places order
     */
    async approveQuote(requestId) {
        const quotes = JSON.parse(localStorage.getItem('printQuotes') || '[]');
        const quote = quotes.find(q => q.requestId === requestId);

        if (!quote) {
            throw new Error('Quote not found');
        }

        // Create print job
        const printJob = {
            ...quote,
            status: 'approved',
            approvedAt: new Date(),
            orderId: 'PO' + Date.now()
        };

        // Add to print queue
        await this.addToPrintQueue(printJob);

        return printJob;
    }

    /**
     * Add job to print queue
     */
    async addToPrintQueue(job) {
        // Select best available printer
        const printer = this.selectPrinter(job);

        if (!printer) {
            throw new Error('No printer available for this job');
        }

        job.assignedPrinter = printer.id;
        job.queuePosition = this.printQueue.length + 1;
        job.estimatedStart = this.calculateEstimatedStart(printer);

        this.printQueue.push(job);

        // Notify customer
        await this.notifyCustomer(job, 'queued');

        // If printer is idle, start immediately
        if (printer.status === 'idle') {
            await this.startPrint(job);
        }

        return job;
    }

    /**
     * Select best printer for job
     */
    selectPrinter(job) {
        // Filter by location and availability
        const candidates = this.printers.filter(p =>
            p.location === job.location &&
            this.canPrint(p, job)
        );

        if (candidates.length === 0) {
            return null;
        }

        // Sort by availability and success rate
        candidates.sort((a, b) => {
            if (a.status === 'idle' && b.status !== 'idle') return -1;
            if (a.status !== 'idle' && b.status === 'idle') return 1;
            return b.successRate - a.successRate;
        });

        return candidates[0];
    }

    /**
     * Check if printer can print this job
     */
    canPrint(printer, job) {
        // Check build volume
        const { length, width, height } = job.dimensions;
        if (length > printer.buildVolume.x ||
            width > printer.buildVolume.y ||
            height > printer.buildVolume.z) {
            return false;
        }

        // Check material compatibility
        if (!printer.materials.includes(job.material)) {
            return false;
        }

        return true;
    }

    /**
     * Calculate estimated start time
     */
    calculateEstimatedStart(printer) {
        if (printer.status === 'idle') {
            return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        }

        // Add current job time + queue time
        const queueTime = this.printQueue
            .filter(j => j.assignedPrinter === printer.id)
            .reduce((sum, j) => sum + j.estimate.printTimeHours, 0);

        return new Date(Date.now() + queueTime * 60 * 60 * 1000);
    }

    /**
     * Start printing a job
     */
    async startPrint(job) {
        const printer = this.printers.find(p => p.id === job.assignedPrinter);

        printer.status = 'printing';
        printer.currentJob = job.orderId;

        job.status = 'printing';
        job.startedAt = new Date();
        job.estimatedCompletion = new Date(
            Date.now() + job.estimate.printTimeHours * 60 * 60 * 1000
        );

        await this.notifyCustomer(job, 'started');

        console.log(`Print started: ${job.orderId} on ${printer.name}`);
    }

    /**
     * Notify customer via SMS/WhatsApp
     */
    async notifyCustomer(job, status) {
        const messages = {
            queued: `Your 3D print request for ${job.part_description} is queued. ` +
                   `Position: ${job.queuePosition}. ` +
                   `Estimated start: ${job.estimatedStart.toLocaleString('en-KE')}. ` +
                   `Order #${job.orderId}`,
            
            started: `Great news! We've started printing your ${job.part_description}. ` +
                    `Estimated completion: ${job.estimatedCompletion.toLocaleString('en-KE')}. ` +
                    `Order #${job.orderId}`,
            
            completed: `Your 3D printed ${job.part_description} is ready for pickup at our ` +
                      `${job.location} branch! Order #${job.orderId}`,
            
            failed: `We encountered an issue printing your ${job.part_description}. ` +
                   `We're reprinting it now at no extra cost. Apologies for the delay!`
        };

        const message = messages[status];

        console.log(`Notification (${status}):`, message);

        // In production, send actual SMS/WhatsApp
        // await sendSMS(job.customer_phone, message);
        // await sendWhatsApp(job.customer_phone, message);

        return message;
    }

    /**
     * Extract warnings from AI response
     */
    extractWarnings(aiResponse) {
        const warnings = [];
        const response = aiResponse.toLowerCase();

        if (response.includes('heat') && response.includes('concern')) {
            warnings.push('Part may be exposed to heat - verify material selection');
        }

        if (response.includes('stress') || response.includes('load')) {
            warnings.push('Consider stress points during installation');
        }

        if (response.includes('fit') || response.includes('tolerance')) {
            warnings.push('Test fit before installation');
        }

        return warnings.length > 0 ? warnings : ['Verify compatibility before installation'];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Print3DSystem;
}

// Make available globally
if (typeof window !== 'undefined') {
    window.Print3DSystem = Print3DSystem;
}
