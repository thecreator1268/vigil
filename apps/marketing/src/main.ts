/**
 * Scroll-driven reveals for the public explainer. GSAP + ScrollTrigger live
 * ONLY here — the working app never scroll-animates, parallaxes or scroll-jacks.
 * Content is fully visible without JS; animation is progressive enhancement,
 * and under prefers-reduced-motion nothing moves at all.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './style.css';

gsap.registerPlugin(ScrollTrigger);

const mm = gsap.matchMedia();

mm.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.from('.hero-in', { y: 16, opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.12 });

  gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
    gsap.from(el, {
      y: 24,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  // The "how it works" steps light up one by one as they scroll into view.
  gsap.utils.toArray<HTMLElement>('.step').forEach((step) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: step, start: 'top 75%', once: true } });
    tl.from(step.querySelector('.num'), { scale: 0.6, opacity: 0, duration: 0.35, ease: 'back.out(2)' })
      .from(step.querySelector('div'), { x: 16, opacity: 0, duration: 0.45, ease: 'power2.out' }, '-=0.15');
  });
});
