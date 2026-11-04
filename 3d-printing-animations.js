// 3D Printing Page Animations - Fade in on scroll (SpaceX-style)

document.addEventListener('DOMContentLoaded', function() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const fadeInObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Once visible, stop observing to prevent re-animation
                fadeInObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe step cards with staggered animation
    const stepCards = document.querySelectorAll('.step-card');
    stepCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 0.1}s`;
        fadeInObserver.observe(card);
    });

    // Observe use case cards with staggered animation
    const useCases = document.querySelectorAll('.use-case');
    useCases.forEach((useCase, index) => {
        useCase.style.transitionDelay = `${index * 0.1}s`;
        fadeInObserver.observe(useCase);
    });

    // Animate property bars when they come into view
    const propertyBars = document.querySelectorAll('.property-fill');
    const barObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const width = entry.target.style.width;
                entry.target.style.width = '0%';
                setTimeout(() => {
                    entry.target.style.width = width;
                }, 100);
                barObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    propertyBars.forEach(bar => {
        barObserver.observe(bar);
    });
});

// Smooth scroll to request form
function scrollToRequest() {
    const requestSection = document.getElementById('request-form');
    if (requestSection) {
        requestSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Make function available globally
window.scrollToRequest = scrollToRequest;
