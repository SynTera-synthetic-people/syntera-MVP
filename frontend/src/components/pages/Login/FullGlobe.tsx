import { useEffect, useRef } from 'react';
import {
    PEOPLE_IMAGES,
    PERSON_NAMES,
    PERSON_PROFESSIONS,
    PERSON_COUNTRIES,
} from '../../../data/people';

const CALLOUT_MESSAGES = [
    "Reviewing the questions",
    "Thinking through options",
    "Responding based on preference",
    "Reflecting on past experience",
    "Choosing based on context",
    "Adjusting response under constraints",

];

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

interface AutoCallout {
    x: number;
    y: number;
    message: string;
    spawnTime: number;
    side: 'left' | 'right';
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

    const totalFaces = 300;
    const imageCount = PEOPLE_IMAGES.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < totalFaces; i++) {
        const theta = goldenAngle * i + seededRandom(i * 31) * 0.22;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / totalFaces);
        const rand = seededRandom(i * 7 + 3);

        // FIX: uniform size for all faces — slight random variance for a natural feel,
        // no index-based tiers that made top faces giant and bottom faces tiny.
        const baseSize = 11 + rand * 2.5;

        points.push({
            phi,
            theta,
            type: 'face',
            imageIndex: i % imageCount,
            baseSize,
            name: pickRandom(PERSON_NAMES, i * 13 + 7),
            profession: pickRandom(PERSON_PROFESSIONS, i * 17 + 11),
            country: pickRandom(PERSON_COUNTRIES, i * 23 + 5),
        });
    }

    return points;
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0]!;

    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        if (ctx.measureText(testLine).width > maxWidth) {
            lines.push(currentLine);
            currentLine = words[i]!;
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);
    return lines;
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

const CALLOUT_LIFETIME = 5000;
const CALLOUT_FADE_IN = 500;
const CALLOUT_FADE_OUT = 600;
const CALLOUT_COOLDOWN = 2000;

export default function FullGlobe() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loadedImages = useRef<HTMLImageElement[]>([]);
    const rotationRef = useRef(0);
    const pointsRef = useRef<GlobePoint[]>([]);
    const animRef = useRef(0);

    const mouseRef = useRef({ x: -9999, y: -9999 });
    const hoverScalesRef = useRef<Map<number, number>>(new Map());

    // ── Callout refs ────────────────────────────────────────────────────────
    const activeCalloutRef = useRef<AutoCallout | null>(null);
    const calloutEndTimeRef = useRef(0);
    const lastMsgIdxRef = useRef(-1);

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
            mouseRef.current = { x: -9999, y: -9999 };
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
            const now = performance.now();
            const dpr = window.devicePixelRatio || 1;

            const w = canvas.width / dpr;
            const h = canvas.height / dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);

            const angle = rotationRef.current;

            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            const tilt = -0.22;

            const cosT = Math.cos(tilt);
            const sinT = Math.sin(tilt);
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.min(w, h) * 0.53;
            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            // atmospheric glow
            const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.2);
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

            for (let idx = 0; idx < pointsRef.current.length; idx++) {
                const point = pointsRef.current[idx]!;

                const sx = Math.sin(point.phi) * Math.cos(point.theta);
                const sy = Math.cos(point.phi);
                const sz = Math.sin(point.phi) * Math.sin(point.theta);

                const rx = sx * cosA + sz * sinA;
                const rz = -sx * sinA + sz * cosA;
                const ry = sy;

                const fy = ry * cosT - rz * sinT;
                const fz = ry * sinT + rz * cosT;

                const perspective = 0.88 + (fz + 1) * 0.06;

                const screenX = cx + rx * radius * perspective;
                const screenY = cy - fy * radius * perspective;

                projected.push({ x: screenX, y: screenY, z: fz, point, idx });
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

            const MIN_CALLOUT_Y = h * 0.1;
            const visibleFaces: { x: number; y: number }[] = [];

            for (const p of projected) {
                const depthNorm = (p.z + 1) / 2;
                const isFront = p.z >= 0;

                const alpha = isFront
                    ? 0.20 + 0.65 * depthNorm
                    : 0.03 + 0.08 * depthNorm;

                const depthScale = isFront
                    ? 0.78 + 0.22 * depthNorm
                    : 0.58 + 0.12 * depthNorm;

                if (p.point.type === 'face') {
                    const img = loadedImages.current[p.point.imageIndex];

                    const baseRenderedSize = p.point.baseSize * depthScale;
                    const r = baseRenderedSize / 2;

                    const dx = mx - p.x;
                    const dy = my - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const isHovered = dist < r && isFront;

                    if (isHovered) isHoveringAny = true;

                    const currentScale = hoverScalesRef.current.get(p.idx) ?? 1;
                    const targetScale = isHovered ? 1.22 : 1;
                    const newScale = lerp(currentScale, targetScale, 0.12);
                    hoverScalesRef.current.set(p.idx, newScale);

                    const size = baseRenderedSize * newScale;
                    const hr = size / 2;

                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.save();
                        ctx.globalAlpha = alpha;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(img, p.x - hr, p.y - hr, size, size);
                        ctx.restore();

                        // white border ring
                        ctx.save();
                        ctx.globalAlpha = alpha * 0.5;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.restore();

                        if (isHovered) {
                            ctx.save();
                            ctx.globalAlpha = 0.35;
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, hr + 1.5, 0, Math.PI * 2);
                            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            ctx.restore();
                        }

                        // collect visible faces for callout spawning
                        if (isFront && depthNorm > 0.5 && p.y > MIN_CALLOUT_Y && p.y < h - 40 && p.x > 60 && p.x < w - 60) {
                            visibleFaces.push({ x: p.x, y: p.y });
                        }
                    }

                    if (isHovered && depthNorm > 0.5 && p.point.name) {
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
                    const dotSize = p.point.baseSize * depthScale;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, dotSize, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.04})`;
                    ctx.fill();
                }
            }

            // ── Callout lifecycle ─────────────────────────────────────────────
            if (activeCalloutRef.current && now - activeCalloutRef.current.spawnTime >= CALLOUT_LIFETIME) {
                activeCalloutRef.current = null;
                calloutEndTimeRef.current = now;
            }

            if (
                !activeCalloutRef.current &&
                now - calloutEndTimeRef.current > CALLOUT_COOLDOWN &&
                visibleFaces.length > 0
            ) {
                const face = visibleFaces[Math.floor(Math.random() * visibleFaces.length)]!;
                let msgIdx = Math.floor(Math.random() * CALLOUT_MESSAGES.length);
                if (msgIdx === lastMsgIdxRef.current) {
                    msgIdx = (msgIdx + 1) % CALLOUT_MESSAGES.length;
                }
                lastMsgIdxRef.current = msgIdx;

                activeCalloutRef.current = {
                    x: face.x,
                    y: face.y,
                    message: CALLOUT_MESSAGES[msgIdx]!,
                    spawnTime: now,
                    side: face.x > w / 2 ? 'left' : 'right',
                };
            }

            // ── Draw callout ──────────────────────────────────────────────────
            if (activeCalloutRef.current) {
                const callout = activeCalloutRef.current;
                const age = now - callout.spawnTime;
                let opacity = 1;
                if (age < CALLOUT_FADE_IN) opacity = age / CALLOUT_FADE_IN;
                else if (age > CALLOUT_LIFETIME - CALLOUT_FADE_OUT) opacity = (CALLOUT_LIFETIME - age) / CALLOUT_FADE_OUT;

                ctx.save();
                ctx.globalAlpha = opacity;

                ctx.beginPath();
                ctx.arc(callout.x, callout.y, 18, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,255,255,${0.6 * opacity})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(callout.x, callout.y, 22, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,255,255,${0.2 * opacity})`;
                ctx.lineWidth = 1;
                ctx.stroke();

                const quoteFont = 'italic 11px "Inter", -apple-system, sans-serif';
                ctx.font = quoteFont;
                const maxTextW = 195;
                const lines = wrapText(ctx, callout.message, maxTextW);

                const padX = 11;
                const padY = 9;
                const accentW = 3;
                const lineH = 16;
                const bw = maxTextW + padX * 2 + accentW;
                const bh = padY * 2 + lines.length * lineH - 4;

                let bx = callout.side === 'right' ? callout.x + 34 : callout.x - 34 - bw;
                bx = Math.max(10, Math.min(w - bw - 10, bx));
                const by = Math.max(MIN_CALLOUT_Y, Math.min(h - bh - 10, callout.y - bh / 2));

                const cardEdgeX = callout.side === 'right' ? bx : bx + bw;
                const cardEdgeY = by + bh / 2;

                ctx.beginPath();
                ctx.moveTo(callout.x, callout.y);
                ctx.lineTo(cardEdgeX, cardEdgeY);
                ctx.strokeStyle = `rgba(148,163,184,${0.5 * opacity})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(callout.x, callout.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.9 * opacity})`;
                ctx.fill();

                const triSize = 8;
                const triDir = callout.side === 'right' ? -1 : 1;
                ctx.beginPath();
                ctx.moveTo(cardEdgeX, cardEdgeY);
                ctx.lineTo(cardEdgeX + triDir * triSize, cardEdgeY - triSize * 0.5);
                ctx.lineTo(cardEdgeX + triDir * triSize, cardEdgeY + triSize * 0.5);
                ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,0.97)';
                ctx.fill();

                drawRoundedRect(ctx, bx, by, bw, bh, 10);
                ctx.shadowColor = 'rgba(0,0,0,0.18)';
                ctx.shadowBlur = 24;
                ctx.shadowOffsetY = 6;
                ctx.fillStyle = 'rgba(255,255,255,0.97)';
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.save();
                drawRoundedRect(ctx, bx, by, bw, bh, 10);
                ctx.clip();
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(bx, by, accentW, bh);
                ctx.restore();

                ctx.font = quoteFont;
                ctx.fillStyle = '#334155';
                ctx.textBaseline = 'top';
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i]!, bx + accentW + padX, by + padY + i * lineH);
                }

                ctx.restore();
            }

            // ── Hover tooltip ─────────────────────────────────────────────────
            if (hoveredFace && hoveredFace.scale > 1.04) {
                const hf = hoveredFace;

                ctx.save();
                ctx.globalAlpha = 0.95;

                const bubbleW = 170;
                const bubbleH = 52;
                const bubbleX = hf.x + 16;
                const bubbleY = hf.y - 26;

                drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 10);
                ctx.fillStyle = 'rgba(15,18,28,0.94)';
                ctx.fill();

                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = '600 12px Inter, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(hf.name, bubbleX + 12, bubbleY + 16);

                ctx.font = '11px Inter, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(`${hf.profession} • ${hf.country}`, bubbleX + 12, bubbleY + 34);

                ctx.restore();
            }

            const hasActiveCallout = !!activeCalloutRef.current;
            if (!isHoveringAny && !hasActiveCallout) {
                rotationRef.current += 0.002;
            }

            canvas.style.cursor = isHoveringAny ? 'pointer' : 'default';

            animRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
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