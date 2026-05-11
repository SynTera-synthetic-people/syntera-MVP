import { useEffect, useRef } from 'react';
import {
    PEOPLE_IMAGES,
    PERSON_NAMES,
    PERSON_PROFESSIONS,
    PERSON_COUNTRIES,
} from '../../../data/people';

interface GlobePoint {
    phi: number;
    theta: number;
    type: 'face' | 'dot';
    imageIndex: number;
    baseSize: number;
    name: string;
    profession: string;
    country: string;
}

function seededRandom(seed: number) {
    const x = Math.sin(seed) * 43758.5453;
    return x - Math.floor(x);
}

function pickRandom<T>(arr: readonly T[], seed: number): T {
    const index = Math.floor(seededRandom(seed) * arr.length);
    return arr[index]!;
}

function generatePoints(): GlobePoint[] {
    const points: GlobePoint[] = [];

    const latCount = 28;

    for (let i = 1; i < latCount; i++) {
        const phi = (Math.PI * i) / latCount;
        const circ = Math.sin(phi);
        const lonCount = Math.max(8, Math.floor(circ * 42));

        for (let j = 0; j < lonCount; j++) {
            const theta = (2 * Math.PI * j) / lonCount;

            points.push({
                phi,
                theta,
                type: 'dot',
                imageIndex: -1,
                baseSize: 0.75,
                name: '',
                profession: '',
                country: '',
            });
        }
    }

    const totalFaces = 450;
    const imageCount = PEOPLE_IMAGES.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < totalFaces; i++) {
        const theta =
            goldenAngle * i * 2.15 + seededRandom(i * 31) * 0.22;

        const phi = Math.acos(
            1 - (2 * (i + 0.5)) / totalFaces,
        );

        const rand = seededRandom(i * 7 + 3);

        let baseSize: number;

        // MUCH SMALLER sizing to match Figma
        if (i < 8) baseSize = 28 + rand * 6;
        else if (i < 25) baseSize = 20 + rand * 5;
        else if (i < 80) baseSize = 15 + rand * 4;
        else if (i < 180) baseSize = 11 + rand * 3;
        else baseSize = 8 + rand * 2;

        points.push({
            phi,
            theta,
            type: 'face',
            imageIndex: i % imageCount,
            baseSize,
            name: pickRandom(PERSON_NAMES, i * 13 + 7),
            profession: pickRandom(
                PERSON_PROFESSIONS,
                i * 17 + 11,
            ),
            country: pickRandom(
                PERSON_COUNTRIES,
                i * 23 + 5,
            ),
        });
    }

    return points;
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export default function FullGlobe() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loadedImages = useRef<HTMLImageElement[]>([]);
    const rotationRef = useRef(0);
    const pointsRef = useRef<GlobePoint[]>([]);
    const animRef = useRef(0);

    const mouseRef = useRef({
        x: -9999,
        y: -9999,
    });

    const hoverScalesRef = useRef<Map<number, number>>(
        new Map(),
    );

    useEffect(() => {
        PEOPLE_IMAGES.forEach((url, i) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            loadedImages.current[i] = img;
        });

        pointsRef.current = generatePoints();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas) return;

        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();

            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        const onMouseLeave = () => {
            mouseRef.current = {
                x: -9999,
                y: -9999,
            };
        };

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        };

        resize();

        window.addEventListener('resize', resize);

        const ctx = canvas.getContext('2d')!;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;

            const w = canvas.width / dpr;
            const h = canvas.height / dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const angle = rotationRef.current;

            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            // Better Figma tilt
            const tilt = -0.22;

            const cosT = Math.cos(tilt);
            const sinT = Math.sin(tilt);
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.min(w, h) * 0.50;
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            // atmospheric glow
            const glow = ctx.createRadialGradient(
                cx,
                cy,
                radius * 0.2,
                cx,
                cy,
                radius * 1.2,
            );

            glow.addColorStop(0, 'rgba(255,255,255,0.03)');
            glow.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.beginPath();
            ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            const projected: {
                x: number;
                y: number;
                z: number;
                point: GlobePoint;
                idx: number;
            }[] = [];

            for (
                let idx = 0;
                idx < pointsRef.current.length;
                idx++
            ) {
                const point = pointsRef.current[idx]!;

                const sx =
                    Math.sin(point.phi) *
                    Math.cos(point.theta);

                const sy = Math.cos(point.phi);

                const sz =
                    Math.sin(point.phi) *
                    Math.sin(point.theta);

                const rx = sx * cosA + sz * sinA;
                const rz = -sx * sinA + sz * cosA;
                const ry = sy;

                const fy = ry * cosT - rz * sinT;
                const fz = ry * sinT + rz * cosT;

                // perspective compression
                const perspective = 0.88 + (fz + 1) * 0.06;

                const screenX =
                    cx + rx * radius * perspective;

                const screenY =
                    cy - fy * radius * perspective;

                projected.push({
                    x: screenX,
                    y: screenY,
                    z: fz,
                    point,
                    idx,
                });
            }

            projected.sort((a, b) => a.z - b.z);

            let isHoveringAny = false;

            let hoveredFace: {
                x: number;
                y: number;
                r: number;
                name: string;
                profession: string;
                country: string;
                scale: number;
            } | null = null;

            for (const p of projected) {
                const depthNorm = (p.z + 1) / 2;
                const isFront = p.z >= 0;

                // MUCH darker backface rendering
                const alpha = isFront
                    ? 0.28 + 0.72 * depthNorm
                    : 0.08 + 0.18 * depthNorm;

                // flatter depth scaling like figma
                const depthScale = isFront
                    ? 0.78 + 0.22 * depthNorm
                    : 0.58 + 0.12 * depthNorm;

                if (p.point.type === 'face') {
                    const img =
                        loadedImages.current[
                        p.point.imageIndex
                        ];

                    const baseRenderedSize =
                        p.point.baseSize * depthScale;

                    const r = baseRenderedSize / 2;

                    const dx = mx - p.x;
                    const dy = my - p.y;

                    const dist = Math.sqrt(dx * dx + dy * dy);

                    const isHovered =
                        dist < r && isFront;

                    if (isHovered) {
                        isHoveringAny = true;
                    }

                    const currentScale =
                        hoverScalesRef.current.get(p.idx) ?? 1;

                    // smaller hover scale
                    const targetScale = isHovered ? 1.22 : 1;

                    const newScale = lerp(
                        currentScale,
                        targetScale,
                        0.12,
                    );

                    hoverScalesRef.current.set(
                        p.idx,
                        newScale,
                    );

                    const size =
                        baseRenderedSize * newScale;

                    const hr = size / 2;

                    if (
                        img &&
                        img.complete &&
                        img.naturalWidth > 0
                    ) {
                        ctx.save();

                        ctx.globalAlpha = alpha;

                        ctx.beginPath();
                        ctx.arc(
                            p.x,
                            p.y,
                            hr,
                            0,
                            Math.PI * 2,
                        );

                        ctx.closePath();
                        ctx.clip();

                        ctx.drawImage(
                            img,
                            p.x - hr,
                            p.y - hr,
                            size,
                            size,
                        );

                        ctx.restore();

                        // subtle glow only
                        if (isHovered) {
                            ctx.save();

                            ctx.globalAlpha = 0.35;

                            ctx.beginPath();
                            ctx.arc(
                                p.x,
                                p.y,
                                hr + 1.5,
                                0,
                                Math.PI * 2,
                            );

                            ctx.strokeStyle =
                                'rgba(255,255,255,0.55)';

                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.restore();
                        }
                    }

                    if (
                        isHovered &&
                        depthNorm > 0.5 &&
                        p.point.name
                    ) {
                        hoveredFace = {
                            x: p.x,
                            y: p.y,
                            r: hr,
                            name: p.point.name,
                            profession: p.point.profession,
                            country: p.point.country,
                            scale: newScale,
                        };
                    }
                } else {
                    const dotSize =
                        p.point.baseSize * depthScale;

                    ctx.beginPath();

                    ctx.arc(
                        p.x,
                        p.y,
                        dotSize,
                        0,
                        Math.PI * 2,
                    );

                    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.08})`;

                    ctx.fill();
                }
            }

            // Smaller cleaner tooltip
            if (hoveredFace && hoveredFace.scale > 1.04) {
                const hf = hoveredFace;

                ctx.save();

                ctx.globalAlpha = 0.95;

                const bubbleW = 170;
                const bubbleH = 52;

                const bubbleX = hf.x + 16;
                const bubbleY = hf.y - 26;

                drawRoundedRect(
                    ctx,
                    bubbleX,
                    bubbleY,
                    bubbleW,
                    bubbleH,
                    10,
                );

                ctx.fillStyle = 'rgba(15,18,28,0.94)';
                ctx.fill();

                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font =
                    '600 12px Inter, sans-serif';

                ctx.fillStyle = '#ffffff';

                ctx.fillText(
                    hf.name,
                    bubbleX + 12,
                    bubbleY + 16,
                );

                ctx.font = '11px Inter, sans-serif';

                ctx.fillStyle = 'rgba(255,255,255,0.55)';

                ctx.fillText(
                    `${hf.profession} • ${hf.country}`,
                    bubbleX + 12,
                    bubbleY + 34,
                );

                ctx.restore();
            }

            // slower rotation like figma
            if (!isHoveringAny) {
                rotationRef.current += 0.00090;
            }

            canvas.style.cursor = isHoveringAny
                ? 'pointer'
                : 'default';

            animRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animRef.current);

            window.removeEventListener('resize', resize);

            canvas.removeEventListener(
                'mousemove',
                onMouseMove,
            );

            canvas.removeEventListener(
                'mouseleave',
                onMouseLeave,
            );
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
                display: 'block',
                filter: 'contrast(1.02) brightness(0.92)',
            }}
        />
    );
}
