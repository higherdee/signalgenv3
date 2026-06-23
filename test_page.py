"""Headless browser test with aggressive cache busting."""
import asyncio
from playwright.async_api import async_playwright

URL = "https://walk-screening-europe-enjoying.trycloudflare.com"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        widths = [(1280, "desktop"), (820, "tablet"), (390, "phone")]
        for width, name in widths:
            # Fresh context = empty cache
            ctx = await browser.new_context(viewport={"width": width, "height": 800})
            page = await ctx.new_page()
            console_msgs = []
            page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
            errors = []
            page.on("pageerror", lambda e: errors.append(f"JS: {e}"))
            print(f"\n═══ {name.upper()} ({width}px) ═══")
            try:
                # Force reload bypassing cache
                await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
                # Wait for chart to be drawn (look for signal pair text)
                try:
                    await page.wait_for_function(
                        "document.getElementById('s-pair').textContent !== '—'",
                        timeout=15000,
                    )
                except Exception:
                    pass
                await page.wait_for_timeout(3000)

                pair = await page.locator("#s-pair").inner_text()
                conf = await page.locator("#s-conf").inner_text()
                direction = await page.locator("#direction-badge").inner_text()
                chart_w = await page.evaluate("document.getElementById('chart-host').clientWidth")
                chart_h = await page.evaluate("document.getElementById('chart-host').clientHeight")
                rows = await page.locator("#rank-body tr").count()
                # Count x-axis labels in chart
                n_labels = await page.evaluate("document.querySelectorAll('#chart-host svg text').length")
                print(f"  Pair: {pair}  |  Dir: {direction}  |  Conf: {conf}")
                print(f"  Chart: {chart_w}×{chart_h}px host  |  SVG <text> elements: {n_labels}")
                print(f"  Ranking: {rows} rows")
                if "BUILD_TAG" in str(console_msgs):
                    print(f"  Build: {BUILD_TAG} ✓ (loaded)")
                else:
                    print(f"  Console msgs (last 3):")
                    for m in console_msgs[-3:]:
                        print(f"    {m}")
                if errors:
                    print(f"  ⚠ Errors: {errors[:3]}")
                else:
                    print(f"  ✓ Clean")

                shot = f"/tmp/screen_{name}.png"
                await page.screenshot(path=shot, full_page=False)
                print(f"  📸 {shot}")
            except Exception as e:
                print(f"  ✗ {e}")
            await ctx.close()
        await browser.close()

asyncio.run(main())
