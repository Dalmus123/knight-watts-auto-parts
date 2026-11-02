# Knight Watts Auto Parts - 3D E-Commerce Platform

A modern, interactive 3D e-commerce website for car spare parts. A subsidiary of **Knight Watts Energy Solutions Limited**, bringing innovation and quality to Embu and Garissa regions in Kenya.

## Features

### 🎨 Modern 3D Visualization
- Interactive 3D product previews using Three.js
- Rotate, zoom, and examine parts before buying
- Smooth animations and responsive controls
- Mobile-optimized touch controls

### 📍 Location-Based Service
- **Embu Branch**: 1,200+ parts in stock
- **Garissa Branch**: 800+ parts in stock
- Real-time stock availability per location
- Location-specific pricing and delivery

### 🚗 Comprehensive Product Catalog
- Engine Parts (filters, timing belts, fuel pumps)
- Brakes & Suspension (brake pads, shock absorbers)
- Electrical Components (alternators, batteries)
- Body Parts (bumpers, mirrors)
- Filters & Fluids (oil filters, air filters)

### 🔍 Smart Search & Filtering
- Real-time search across products
- Filter by category, car make, and location
- Compatible with major brands: Toyota, Nissan, Mitsubishi, Mazda, Suzuki, Honda

### 💳 Kenya-Ready Features
- M-Pesa payment integration ready
- Local phone number formats
- WhatsApp contact integration
- Mobile-first responsive design
- Fast delivery within Eastern Kenya

### 🛒 E-Commerce Functionality
- Shopping cart with local storage
- Product specifications display
- Stock availability tracking
- Contact forms for inquiries

## Technology Stack

- **Frontend**: Vanilla JavaScript (no build step required)
- **3D Graphics**: Three.js (r128)
- **Styling**: Custom CSS with modern design system
- **Storage**: LocalStorage for cart and preferences
- **Fonts**: Inter from Google Fonts

## File Structure

```
car-spares/
├── index.html          # Main HTML structure
├── styles.css          # Complete styling and responsive design
├── app.js             # Application logic, 3D rendering, cart management
└── README.md          # This file
```

## Quick Start

### Local Development

1. **Simple HTTP Server** (Python):
   ```bash
   cd car-spares
   python3 -m http.server 8000
   ```
   Open http://localhost:8000

2. **Node.js Server**:
   ```bash
   npx http-server car-spares -p 8000
   ```

3. **VS Code Live Server**: Right-click `index.html` → "Open with Live Server"

### Deployment Options

#### 1. GitHub Pages (Free)
```bash
git init
git add .
git commit -m "Initial commit: 3D Auto Parts Kenya"
git branch -M main
git remote add origin YOUR_GITHUB_REPO
git push -u origin main
```
Then enable GitHub Pages in repository settings.

#### 2. Netlify (Free)
- Drag and drop the `car-spares` folder to netlify.com/drop
- Or connect your GitHub repository for automatic deployments

#### 3. Vercel (Free)
```bash
npm i -g vercel
cd car-spares
vercel
```

#### 4. Cloudflare Pages (Free)
- Connect your GitHub repository
- Build command: (none needed)
- Output directory: `/`

#### 5. Traditional Hosting (Kenya Providers)
Upload to any web hosting service:
- **Truehost Kenya** (truehost.co.ke)
- **Safaricom Web Hosting**
- **Kenya Web Experts** (kenyawebexperts.com)

## Customization Guide

### Adding New Products

Edit the `products` array in `app.js`:

```javascript
{
    id: 13,
    name: 'Your Product Name',
    category: 'engine', // engine, brakes, electrical, body, filters
    make: 'toyota',     // toyota, nissan, mitsubishi, mazda, suzuki, honda
    price: 5000,        // in KSh
    description: 'Product description here',
    locations: {
        embu: { stock: 10, available: true },
        garissa: { stock: 5, available: true }
    },
    specs: {
        'Brand': 'Brand Name',
        'Compatibility': 'Vehicle models',
        'Warranty': '12 months'
    }
}
```

### Changing Contact Information

Update in `index.html`:
- Phone numbers (search for `+254 714 243 345`)
- Email address (search for `info@autopartske.com`)
- Physical addresses in the Locations section

### Updating Colors

Edit CSS variables in `styles.css`:

```css
:root {
    --primary-color: #00A86B;      /* Main brand color */
    --primary-dark: #008555;       /* Darker shade */
    --primary-light: #00D084;      /* Lighter shade */
    --secondary-color: #FF6B35;    /* Accent color */
}
```

### Adding More Locations

1. Update location data structure in `app.js`
2. Add location cards in the Locations section of `index.html`
3. Update the location modal options

## Kenya Market Considerations

### Payment Integration

**M-Pesa Integration** (requires business account):
1. Register for M-Pesa Paybill with Safaricom
2. Integrate using Safaricom Daraja API
3. Resources: developer.safaricom.co.ke

**Alternative Payment Methods**:
- Airtel Money
- Bank transfers (Equity, KCB, Co-operative Bank)
- Cash on delivery

### Delivery Services

Partner with local delivery services:
- **Embu**: Local boda-boda networks, G4S Secure Transit
- **Garissa**: Trusted delivery partners, matatu courier services
- **Inter-city**: Modern Coast, Easy Coach cargo services

### Marketing Channels

- **WhatsApp Business**: Main customer communication
- **Facebook**: Auto parts groups and local communities
- **Instagram**: Product showcases and customer reviews
- **Local Radio**: Embu and Garissa stations
- **SMS Marketing**: Bulk SMS services

### Mobile Optimization

The site is fully optimized for mobile as most Kenyan users access internet via smartphones:
- Fast loading on 3G/4G networks
- Touch-optimized 3D controls
- Minimal external dependencies
- Responsive design for all screen sizes

## SEO Optimization

### Meta Tags to Add

```html
<meta name="keywords" content="car parts Kenya, spare parts Embu, auto parts Garissa, 3D car parts">
<meta property="og:title" content="3D Auto Parts Kenya - Embu & Garissa">
<meta property="og:description" content="Buy quality car spare parts online with 3D visualization">
<meta property="og:image" content="YOUR_PREVIEW_IMAGE_URL">
```

### Google My Business

Register both locations:
1. Embu Branch - Complete address and hours
2. Garissa Branch - Complete address and hours
3. Add photos, services, and customer reviews

## Performance

- **First Load**: < 2 seconds on 3G
- **Interactive**: < 3 seconds
- **3D Load**: < 1 second per product
- **No Build Process**: Edit and deploy instantly

## Browser Support

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (iOS and macOS)
- ✅ Opera
- ✅ Mobile browsers (Chrome, Safari, Samsung Internet)

## Security Considerations

- Always use HTTPS in production
- Sanitize user inputs in contact forms
- Implement rate limiting for form submissions
- Use environment variables for API keys (M-Pesa, etc.)
- Regular security updates

## Future Enhancements

### Phase 2 Features
- [ ] User accounts and order history
- [ ] Advanced 3D models (GLTF/GLB format)
- [ ] Real-time M-Pesa payment processing
- [ ] SMS notifications for orders
- [ ] Admin dashboard for inventory management
- [ ] Multiple language support (English, Swahili)
- [ ] Customer reviews and ratings
- [ ] Live chat support
- [ ] Delivery tracking system
- [ ] Loyalty points program

### Phase 3 Features
- [ ] Mobile app (React Native)
- [ ] AR (Augmented Reality) product preview
- [ ] AI-powered part recommendations
- [ ] Integration with car diagnostic tools
- [ ] Franchise management system
- [ ] Wholesale buyer portal

## Support & Maintenance

### Regular Updates
- Update stock levels weekly
- Add new products monthly
- Review and respond to customer inquiries daily
- Monitor site performance and uptime
- Backup data regularly

### Analytics
Recommended tools:
- **Google Analytics**: Track visitor behavior
- **Hotjar**: Understand user interactions
- **Facebook Pixel**: Track conversions from ads

## License

Proprietary - Knight Watts Auto Parts 2024-2026. A Subsidiary of Knight Watts Energy Solutions Limited.

## Contact

For technical support or business inquiries:
- Email: dev@autopartske.com
- Phone: +254 714 243 345 (Embu & Garissa)
- WhatsApp: +254 714 243 345

---

## Getting Started Checklist

### Before Launch
- [ ] Update all contact information
- [ ] Verify product database is complete
- [ ] Test on multiple devices and browsers
- [ ] Set up M-Pesa business account
- [ ] Register domain name (e.g., autopartske.co.ke)
- [ ] Configure hosting and SSL certificate
- [ ] Set up business email addresses
- [ ] Create social media accounts
- [ ] Register with Google My Business
- [ ] Prepare launch marketing materials

### Post-Launch
- [ ] Monitor site analytics
- [ ] Respond to customer inquiries
- [ ] Update stock levels regularly
- [ ] Collect customer feedback
- [ ] Optimize based on user behavior
- [ ] Expand product catalog
- [ ] Build delivery partnerships
- [ ] Run promotional campaigns

---

**Built with ❤️ for the Kenyan auto parts market**
