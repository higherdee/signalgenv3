"""Debug: dump chart SVG to see what's actually being drawn."""
import asyncio
from playwright.async_api import async_playwright

URL = "https://hat-responsibility-along-fixed.trycloudflare.com"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 800})
        page = await ctx.new_page()
        await page.goto(URL + f"?bust={int(__import__('time').time())}", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(5000)
        # Dump all text elements in the SVG
        text_info = await page.evaluate("""
            () => {
              const texts = document.querySelectorAll('#chart-host svg text');
              return Array.from(texts).map(t => ({
                x: t.getAttribute('x'),
                y: t.getAttribute('y'),
                text: t.textContent,
              }));
            }
        """)
        print(f"Total text elements: {len(text_info)}")
        for t in text_info:
            print(f"  ({t['x']:>5}, {t['y']:>5}): {t['text'][:30]!r}")
        await browser.close()

asyncio.run(main())
