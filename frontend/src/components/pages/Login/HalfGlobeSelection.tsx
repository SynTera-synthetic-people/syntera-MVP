import HalfGlobe from './HalfGlobe';

export default function HalgGlobeSection() {
    return (
        <section id="half-globe-section" className="relative overflow-hidden" style={{ minHeight: '60vh', backgroundColor: '#0E0F12' }}>
            <div className="absolute inset-0">
                <HalfGlobe />
            </div>

            <div className="absolute inset-x-0 top-0 h-24 pointer-events-none z-10" style={{ background: 'linear-gradient(to bottom, #0E0F12, transparent)' }} />
            <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none z-10" style={{ background: 'linear-gradient(to top, #0E0F12, transparent)' }} />
        </section>
    );
}
