import { useEffect, useRef } from 'react';
import { PEOPLE_IMAGES, PERSON_NAMES, PERSON_PROFESSIONS, PERSON_COUNTRIES } from "../../../data/people";


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

    const latCount = 36;
    for (let i = 1; i < latCount; i++) {
        const phi = (Math.PI * i) / latCount;
        const circ = Math.sin(phi);
        const lonCount = Math.max(6, Math.floor(circ * 64));
        for (let j = 0; j < lonCount; j++) {
            const theta = (2 * Math.PI * j) / lonCount;
            points.push({
                phi, theta, type: 'dot', imageIndex: -1, baseSize: 1.2,
                name: '', profession: '', country: '',
            });
        }
    }

    const totalFaces = 700;
    const imageCount = PEOPLE_IMAGES.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < totalFaces; i++) {
        const theta = goldenAngle * i * 2.39 + seededRandom(i * 31) * 0.4;
        const phi = Math.acos(1 - 2 * (i + 0.5) / totalFaces);
        const rand = seededRandom(i * 7 + 3);
        let baseSize: number;
        if (i < 8) baseSize = 52 + rand * 18;
        else if (i < 25) baseSize = 38 + rand * 14;
        else if (i < 70) baseSize = 26 + rand * 12;
        else if (i < 180) baseSize = 18 + rand * 10;
        else baseSize = 14 + rand * 8;

        // REPLACE THIS BLOCK:
        points.push({
            phi, theta, type: 'face',
            imageIndex: i % imageCount,
            baseSize,
            name: pickRandom(PERSON_NAMES, i * 13 + 7)!,           // Add ! here
            profession: pickRandom(PERSON_PROFESSIONS, i * 17 + 11)!, // Add ! here
            country: pickRandom(PERSON_COUNTRIES, i * 23 + 5)!,    // Add ! here
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

    if (words.length === 0) return lines;

    let currentLine = words[0]!; // Add ! here

    for (let i = 1; i < words.length; i++) {
        const word = words[i]!; // Add ! here
        const testLine = currentLine + ' ' + word;
        if (ctx.measureText(testLine).width > maxWidth) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine);
    return lines;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export default function HalfGlobe() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loadedImages = useRef<HTMLImageElement[]>([]);
    const rotationRef = useRef(0);
    const pointsRef = useRef<GlobePoint[]>([]);
    const animRef = useRef(0);
    const mouseRef = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
    const hoverScalesRef = useRef<Map<number, number>>(new Map());

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
            mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

            const tilt = -0.18;
            const cosT = Math.cos(tilt);
            const sinT = Math.sin(tilt);

            const radius = Math.min(w, h) * 0.90; // Much larger globe
            const cx = w / 2;        // Keep centered
            const cy = h * 1.25;

            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            const projected: { x: number; y: number; z: number; point: GlobePoint; idx: number }[] = [];

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

                const screenX = cx + rx * radius;
                const screenY = cy - fy * radius;

                if (screenY > h + 60 || screenY < -60 || screenX < -60 || screenX > w + 60) continue;

                projected.push({ x: screenX, y: screenY, z: fz, point, idx });
            }

            projected.sort((a, b) => a.z - b.z);

            let isHoveringAny = false;
            let hoveredFace: {
                x: number; y: number; r: number;
                name: string; profession: string; country: string;
                scale: number;
            } | null = null;

            const MIN_CALLOUT_Y = h * 0.1;
            const visibleFaces: { x: number; y: number }[] = [];

            for (const p of projected) {
                const depthNorm = (p.z + 1) / 2;
                const isFront = p.z >= 0;
                const alpha = isFront
                    ? 0.15 + 0.85 * depthNorm
                    : 0.05 + 0.25 * depthNorm;
                const depthScale = isFront
                    ? 0.35 + 0.65 * depthNorm
                    : 0.15 + 0.3 * depthNorm;

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
                    const targetScale = isHovered ? 1.5 : 1;
                    const newScale = lerp(currentScale, targetScale, 0.15);
                    hoverScalesRef.current.set(p.idx, newScale);

                    const size = baseRenderedSize * newScale;
                    const hr = size / 2;

                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.save();
                        ctx.globalAlpha = isHovered ? 1 : alpha;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(img, p.x - hr, p.y - hr, size, size);
                        ctx.restore();

                        if (newScale > 1.02) {
                            ctx.save();
                            ctx.globalAlpha = (newScale - 1) * 1.5;
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, hr + 2, 0, Math.PI * 2);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                            ctx.lineWidth = 2;
                            ctx.stroke();
                            ctx.restore();
                        }

                        if (isFront && depthNorm > 0.5 && p.y > MIN_CALLOUT_Y && p.y < h - 40 && p.x > 60 && p.x < w - 60) {
                            visibleFaces.push({ x: p.x, y: p.y });
                        }
                    } else {
                        const hue = seededRandom(p.point.imageIndex * 13) * 60 + 10;
                        ctx.save();
                        ctx.globalAlpha = alpha * 0.45;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, hr * 0.5, 0, Math.PI * 2);
                        ctx.fillStyle = `hsl(${hue}, 40%, 55%)`;
                        ctx.fill();
                        ctx.restore();
                    }

                    if (isHovered && depthNorm > 0.4 && p.point.name) {
                        hoveredFace = {
                            x: p.x, y: p.y, r: hr,
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
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.2})`;
                    ctx.fill();
                }
            }

            if (hoveredFace && hoveredFace.scale > 1.08) {
                const hf = hoveredFace;
                const calloutAlpha = Math.min((hf.scale - 1) * 2, 1);

                ctx.save();
                ctx.globalAlpha = calloutAlpha;

                const nameFont = 'bold 13px "Inter", -apple-system, sans-serif';
                const detailFont = '11px "Inter", -apple-system, sans-serif';

                ctx.font = nameFont;
                const nameW = ctx.measureText(hf.name).width;
                ctx.font = detailFont;
                const profW = ctx.measureText(hf.profession).width;
                const countryW = ctx.measureText(hf.country).width;

                const padX = 14;
                const padY = 10;
                const lineH = 18;
                const bubbleW = Math.max(nameW, profW, countryW) + padX * 2;
                const bubbleH = lineH * 3 + padY * 2 - 6;

                const side = hf.x > w / 2 ? 'left' : 'right';
                let bubbleX: number;
                if (side === 'right') {
                    bubbleX = hf.x + hf.r + 14;
                } else {
                    bubbleX = hf.x - hf.r - 14 - bubbleW;
                }
                bubbleX = Math.max(8, Math.min(w - bubbleW - 8, bubbleX));
                const bubbleY = Math.max(8, Math.min(h - bubbleH - 8, hf.y - bubbleH / 2));

                const lineStartX = side === 'right' ? hf.x + hf.r + 3 : hf.x - hf.r - 3;
                const lineEndX = side === 'right' ? bubbleX - 2 : bubbleX + bubbleW + 2;
                ctx.beginPath();
                ctx.moveTo(lineStartX, hf.y);
                ctx.lineTo(lineEndX, bubbleY + bubbleH / 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${calloutAlpha * 0.35})`;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.stroke();
                ctx.setLineDash([]);

                drawRoundedRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 8);

                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 12;
                ctx.shadowOffsetY = 4;
                ctx.fillStyle = 'rgba(10, 15, 25, 0.92)';
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = nameFont;
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'top';
                ctx.fillText(hf.name, bubbleX + padX, bubbleY + padY);

                ctx.font = detailFont;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillText(hf.profession, bubbleX + padX, bubbleY + padY + lineH);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillText(hf.country, bubbleX + padX, bubbleY + padY + lineH * 2);

                ctx.restore();
            }

            if (!isHoveringAny) {
                rotationRef.current += 0.0012;
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
            style={{ display: 'block' }}
        />
    );
}
