export class ScriptSystem {
    constructor() {
        this.runningProcesses = [];
    }

    executeAll(gameRoot) {
        this.stopAll();
        const scripts = [];
        const collect = (instance) => {
            if (instance.ClassName === "Script") {
                scripts.push(instance);
            }
            for (const child of instance.children) {
                collect(child);
            }
        };
        collect(gameRoot);

        for (const script of scripts) {
            this.run(script);
        }
    }

    run(scriptInstance) {
        try {
            // --- NEW: TWEEENING SOLVER ENGINE --- [3]
            const ease = (t, style) => {
                if (style === 'Bounce') {
                    const n1 = 7.5625, d1 = 2.75;
                    if (t < 1 / d1) return n1 * t * t;
                    else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
                    else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
                    else return n1 * (t -= 2.625 / d1) * t + 0.984375;
                }
                if (style === 'Sine') return Math.sin((t * Math.PI) / 2);
                return t; // Linear
            };

            const lerp = (start, end, t) => start + (end - start) * t;

            const TweenService = {
                Create: (instance, duration, targetProps, easingStyle = 'Linear') => {
                    return {
                        Play: () => {
                            const startTime = Date.now();
                            const startProps = {};
                            
                            // Capture starting vectors
                            for (const key in targetProps) {
                                if (key === "Position") startProps.Position = instance.Position.clone();
                                else if (key === "Size") startProps.Size = instance.Size.clone();
                                else startProps[key] = instance[key];
                            }

                            const tick = () => {
                                const elapsed = Date.now() - startTime;
                                const progress = Math.min(1, elapsed / duration);
                                const t = ease(progress, easingStyle);

                                for (const key in targetProps) {
                                    if (key === "Position") {
                                        instance.Position.x = lerp(startProps.Position.x, targetProps.Position.x, t);
                                        instance.Position.y = lerp(startProps.Position.y, targetProps.Position.y, t);
                                        instance.Position.z = lerp(startProps.Position.z, targetProps.Position.z, t);
                                    } else if (key === "Size") {
                                        instance.Size.x = lerp(startProps.Size.x, targetProps.Size.x, t);
                                        instance.Size.y = lerp(startProps.Size.y, targetProps.Size.y, t);
                                        instance.Size.z = lerp(startProps.Size.z, targetProps.Size.z, t);
                                    } else if (key === "Color" || key === "BackgroundColor" || key === "TextColor") {
                                        // Interplate color channels independently [3]
                                        const r1 = (startProps[key] >> 16) & 255;
                                        const g1 = (startProps[key] >> 8) & 255;
                                        const b1 = startProps[key] & 255;

                                        const r2 = (targetProps[key] >> 16) & 255;
                                        const g2 = (targetProps[key] >> 8) & 255;
                                        const b2 = targetProps[key] & 255;

                                        const r = Math.round(lerp(r1, r2, t));
                                        const g = Math.round(lerp(g1, g2, t));
                                        const b = Math.round(lerp(b1, b2, t));

                                        instance[key] = (r << 16) + (g << 8) + b;
                                    } else {
                                        instance[key] = lerp(startProps[key], targetProps[key], t);
                                    }
                                }

                                instance.updateTransform?.();
                                window.dispatchEvent(new CustomEvent('gui-changed'));

                                if (progress < 1) {
                                    const nextFrame = requestAnimationFrame(tick);
                                    this.runningProcesses.push(nextFrame);
                                }
                            };
                            tick();
                        }
                    };
                }
            };

            const context = {
                script: scriptInstance,
                game: window.game,
                TweenService: TweenService, // [3]
                print: (...args) => console.log(`[Script: ${scriptInstance.Name}]:`, ...args),
                wait: (ms) => new Promise((resolve) => {
                    const timeout = setTimeout(resolve, ms);
                    this.runningProcesses.push(timeout);
                })
            };

            const keys = Object.keys(context);
            const values = Object.values(context);

            const executionWrapper = new Function(...keys, `
                (async () => {
                    try {
                        ${scriptInstance.Source}
                    } catch (e) {
                        console.error("[Script Runtime Error]:", e);
                    }
                })();
            `);

            executionWrapper(...values);
        } catch (e) {
            console.error(`Compilation Error in ${scriptInstance.Name}:`, e);
        }
    }

    stopAll() {
        for (const process of this.runningProcesses) {
            clearTimeout(process);
            cancelAnimationFrame(process); // Destructs frame tweeners
        }
        this.runningProcesses = [];
    }
}