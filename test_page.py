"""Headless screenshot of the new dashboard."""
import asyncio
from playwright.async_api import async_playwright

URL = "https://symantec-ambien-knitting-grow.trycloudflare.com"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for w, name in [(1280, "desktop"), (820, "tablet"), (390, "phone")]:
            ctx = await browser.new_context(viewport={"width": w, "height": 900})
            page = await ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            print(f"\n=== {name} ({w}px) ===")
            try:
                await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
                # Wait for chart
                await page.wait_for_function(
                    "document.querySelectorAll('#chart-host svg').length > 0",
                    timeout=30000)
                await page.wait_for_timeout(2000)
                pair = await page.locator("#s-pair").inner_text()
                conf = await page.locator("#s-conf").inner_text()
                dir_ = await page.locator("#direction-badge").inner_text()
                print(f"  Pair: {pair}  Dir: {dir_}  Conf: {conf}")
                # Check chat panel exists
                chat_panel = await page.locator("#chat-panel").count()
                chat_toggle = await page.locator("#chat-toggle").count()
                print(f"  Chat panel: {chat_panel}, toggle: {chat_toggle}")
                # Check timeframe buttons
                tf_buttons = await page.locator(".tf-btn").count()
                print(f"  Timeframe buttons: {tf_buttons}")
                # Check SMC toggles
                fvg_t = await page.locator("#toggle-fvg").count()
                bos_t = await page.locator("#toggle-bos").count()
                ob_t = await page.locator("#toggle-ob").count()
                print(f"  SMC toggles: FVG={fvg_t} BOS={bos_t} OB={ob_t}")
                shot = f"/home/user/static/screen_{name}_v3.png"
                await page.screenshot(path=shot, full_page=False)
                print(f"  📸 {shot}")
                if errs: print(f"  ⚠ errors: {errs[:3]}")
                else: print(f"  ✓ Clean")
            except Exception as e:
                print(f"  ✗ {e}")
            await ctx.close()
        await browser.close()

asyncio.run(main())
