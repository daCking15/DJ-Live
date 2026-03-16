#!/usr/bin/env python3
"""Apply Life Mode edits: query length cap and early finalization on silence."""
import re

path = "/Users/chrisking/Documents/Development/2026/DJ-Live/index.html"
with open(path, "r") as f:
    content = f.read()

# 1. Add constants
old1 = "    const LIFE_MODE_DEBOUNCE_MS = 5000;\n    const LIFE_MODE_QUERY_COOLDOWN_MS = 5000;"
new1 = """    const LIFE_MODE_DEBOUNCE_MS = 5000;
    const LIFE_MODE_QUERY_COOLDOWN_MS = 5000;
    const LIFE_MODE_QUERY_MAX_CHARS = 65;
    const LIFE_MODE_SILENCE_MS = 1500;"""
if old1 in content:
    content = content.replace(old1, new1)
    print("1. Added constants")
else:
    print("1. Constants pattern not found")

# 2. Add lifeModeSilenceTimer variable
old2 = "    let lifeModeSearchDebounceTimer = null;\n    let lifeModeQueryCountdownInterval = null;"
new2 = "    let lifeModeSearchDebounceTimer = null;\n    let lifeModeSilenceTimer = null;\n    let lifeModeQueryCountdownInterval = null;"
if old2 in content:
    content = content.replace(old2, new2)
    print("2. Added lifeModeSilenceTimer")
else:
    print("2. Silence timer var pattern not found")

# 3. Add capQueryForScreen helper
old3 = """    function startLifeModeSpeechRecognition() {
      if (!isLifeModeListening || !lifeModeRecognition) return;"""
new3 = """    function capQueryForScreen(text) {
      const t = (text || '').trim();
      if (t.length <= LIFE_MODE_QUERY_MAX_CHARS) return t;
      const capped = t.slice(0, LIFE_MODE_QUERY_MAX_CHARS);
      const lastSpace = capped.lastIndexOf(' ');
      return (lastSpace > 20 ? capped.slice(0, lastSpace) : capped).trim();
    }

    function startLifeModeSpeechRecognition() {
      if (!isLifeModeListening || !lifeModeRecognition) return;"""
if old3 in content:
    content = content.replace(old3, new3)
    print("3. Added capQueryForScreen")
else:
    print("3. capQueryForScreen pattern not found")

# 4. (removed - was invalid)
old5 = """          lifeModeSearchDebounceTimer = setTimeout(() => {
            lifeModeSearchDebounceTimer = null;
            if (lifeModeQueryCountdownInterval) {
              clearInterval(lifeModeQueryCountdownInterval);
              lifeModeQueryCountdownInterval = null;
            }
            if (!isLifeModeListening) return;
            lifeModeQueryCooldownUntil = Date.now() + LIFE_MODE_QUERY_COOLDOWN_MS;
            const q = lifeModeCurrentDisplay.trim();
            if (q.length >= 2) lifeModeSearchAndPlay(q);"""

# Actually we need to wrap the whole callback. Let me do a different approach - just add the silence timer and cap the query.
# Simpler: replace "const q = lifeModeCurrentDisplay.trim()" with "const q = capQueryForScreen(lifeModeCurrentDisplay)"
old5a = "            const q = lifeModeCurrentDisplay.trim();"
new5a = "            const q = capQueryForScreen(lifeModeCurrentDisplay);"
if old5a in content:
    content = content.replace(old5a, new5a)
    print("5. Capped query")
else:
    print("5. Query cap pattern not found")

# 6. Add silence timer - when we start debounce, also start silence timer. When onresult fires with new content and debounce is running, reset silence timer.
# Need to add silence timer start when we enter the debounce block
old6 = """        if (lifeModeCurrentDisplay.trim().length >= 1 && !lifeModeSearchDebounceTimer && !inCooldown) {
          if (lifeModeWordsEl) lifeModeWordsEl.classList.add('visible');
          if (lifeModeFullscreenTextEl) lifeModeFullscreenTextEl.style.visibility = '';
          let secLeft = Math.ceil(LIFE_MODE_DEBOUNCE_MS / 1000);
          updateLifeModeMic(secLeft, true);
          if (lifeModeQueryCountdownInterval) clearInterval(lifeModeQueryCountdownInterval);
          lifeModeQueryCountdownInterval = setInterval(() => {"""
new6 = """        if (lifeModeCurrentDisplay.trim().length >= 1 && !lifeModeSearchDebounceTimer && !inCooldown) {
          if (lifeModeWordsEl) lifeModeWordsEl.classList.add('visible');
          if (lifeModeFullscreenTextEl) lifeModeFullscreenTextEl.style.visibility = '';
          let secLeft = Math.ceil(LIFE_MODE_DEBOUNCE_MS / 1000);
          updateLifeModeMic(secLeft, true);
          if (lifeModeQueryCountdownInterval) clearInterval(lifeModeQueryCountdownInterval);
          if (lifeModeSilenceTimer) clearTimeout(lifeModeSilenceTimer);
          lifeModeQueryCountdownInterval = setInterval(() => {"""
if new6 not in content and old6 in content:
    content = content.replace(old6, new6)
    print("6. Added silence timer clear in debounce start")
else:
    print("6. Silence timer clear pattern not found or already done")

# 7. Start silence timer when we start debounce - add it right after the setInterval for countdown
# We need to add: lifeModeSilenceTimer = setTimeout(runQuery, LIFE_MODE_SILENCE_MS) and reset it each time onresult fires when we have debounce
# The tricky part: we need to reset silence timer each time we get new words WHILE debounce is running.
# Add a block: when lifeModeSearchDebounceTimer is set and we get new words, reset silence timer
old7 = """        const inCooldown = Date.now() < lifeModeQueryCooldownUntil;
        if (!inCooldown) {
          updateLifeModeWords(lifeModeCurrentDisplay, !!interim, null);
          if (lifeModeCurrentDisplay.trim().length >= 1 && lifeModeWordsEl) lifeModeWordsEl.classList.add('visible');
        }
        if (lifeModeCurrentDisplay.trim().length >= 1 && !lifeModeSearchDebounceTimer && !inCooldown) {"""
new7 = """        const inCooldown = Date.now() < lifeModeQueryCooldownUntil;
        if (!inCooldown) {
          updateLifeModeWords(lifeModeCurrentDisplay, !!interim, null);
          if (lifeModeCurrentDisplay.trim().length >= 1 && lifeModeWordsEl) lifeModeWordsEl.classList.add('visible');
          if (lifeModeSearchDebounceTimer && lifeModeCurrentDisplay.trim().length >= 1) {
            if (lifeModeSilenceTimer) clearTimeout(lifeModeSilenceTimer);
            lifeModeSilenceTimer = setTimeout(() => {
              lifeModeSilenceTimer = null;
              if (!lifeModeSearchDebounceTimer) return;
              lifeModeSearchDebounceTimer = null;
              if (lifeModeQueryCountdownInterval) { clearInterval(lifeModeQueryCountdownInterval); lifeModeQueryCountdownInterval = null; }
              if (!isLifeModeListening) return;
              lifeModeQueryCooldownUntil = Date.now() + LIFE_MODE_QUERY_COOLDOWN_MS;
              const q = capQueryForScreen(lifeModeCurrentDisplay);
              if (q.length >= 2) lifeModeSearchAndPlay(q);
              fullTranscript = '';
              lifeModeCurrentDisplay = '';
              if (lifeModeRecognition && isLifeModeListening) lifeModeRecognition.abort();
              if (lifeModeWordsEl) lifeModeWordsEl.classList.remove('visible');
              let cooldownSec = Math.ceil(LIFE_MODE_QUERY_COOLDOWN_MS / 1000);
              if (lifeModeCooldownCountdownInterval) clearInterval(lifeModeCooldownCountdownInterval);
              updateLifeModeMic(cooldownSec, false, 'until next');
              lifeModeCooldownCountdownInterval = setInterval(() => {
                if (!isLifeModeListening) { clearInterval(lifeModeCooldownCountdownInterval); lifeModeCooldownCountdownInterval = null; return; }
                cooldownSec -= 1;
                if (cooldownSec >= 1) { updateLifeModeMic(cooldownSec, false, 'until next'); } else {
                  if (lifeModeCooldownCountdownInterval) { clearInterval(lifeModeCooldownCountdownInterval); lifeModeCooldownCountdownInterval = null; }
                  updateLifeModeMic(null, true);
                }
              }, 1000);
            }, LIFE_MODE_SILENCE_MS);
          }
        }
        if (lifeModeCurrentDisplay.trim().length >= 1 && !lifeModeSearchDebounceTimer && !inCooldown) {"""
if new7 not in content and old7 in content:
    content = content.replace(old7, new7)
    print("7. Added silence timer reset and early fire")
else:
    print("7. Silence timer block pattern not found or already done")

# 8. Start silence timer when we first enter the debounce block (inside the if that starts the debounce)
# Actually the silence timer needs to be started when we START the debounce. The reset happens on each onresult.
# So we need to start it in the block where we set lifeModeSearchDebounceTimer. Let me add it there.
old8 = """          lifeModeSearchDebounceTimer = setTimeout(() => {
            lifeModeSearchDebounceTimer = null;
            if (lifeModeQueryCountdownInterval) {
              clearInterval(lifeModeQueryCountdownInterval);
              lifeModeQueryCountdownInterval = null;
            }
            if (!isLifeModeListening) return;
            lifeModeQueryCooldownUntil = Date.now() + LIFE_MODE_QUERY_COOLDOWN_MS;
            const q = capQueryForScreen(lifeModeCurrentDisplay);
            if (q.length >= 2) lifeModeSearchAndPlay(q);
            fullTranscript = '';
            lifeModeCurrentDisplay = '';
            if (lifeModeRecognition && isLifeModeListening) lifeModeRecognition.abort();
            if (lifeModeWordsEl) lifeModeWordsEl.classList.remove('visible');
            let cooldownSec = Math.ceil(LIFE_MODE_QUERY_COOLDOWN_MS / 1000);
            if (lifeModeCooldownCountdownInterval) clearInterval(lifeModeCooldownCountdownInterval);
            updateLifeModeMic(cooldownSec, false, 'until next');
            lifeModeCooldownCountdownInterval = setInterval(() => {
              if (!isLifeModeListening) {
                clearInterval(lifeModeCooldownCountdownInterval);
                lifeModeCooldownCountdownInterval = null;
                return;
              }
              cooldownSec -= 1;
              if (cooldownSec >= 1) {
                updateLifeModeMic(cooldownSec, false, 'until next');
              } else {
                if (lifeModeCooldownCountdownInterval) {
                  clearInterval(lifeModeCooldownCountdownInterval);
                  lifeModeCooldownCountdownInterval = null;
                }
                updateLifeModeMic(null, true);
              }
            }, 1000);
          }, LIFE_MODE_DEBOUNCE_MS);"""
# The silence timer is reset on each onresult. So we need to INITIALLY start it when we enter the debounce block.
# Add after lifeModeQueryCountdownInterval = setInterval: lifeModeSilenceTimer = setTimeout(..., LIFE_MODE_SILENCE_MS)
# But the setTimeout needs to do the same as the debounce callback. This would duplicate a lot of code.
# Simpler approach: have the silence timer just clear the debounce timer and trigger the same logic. We could use a shared function.
# Actually the simplest is: when silence timer fires, we clear the debounce timer and manually run the callback logic. The code would be duplicated. Let me keep it simpler - the silence timer in step 7 already has the full logic. So we just need to START that timer when we first get words. The key is: we only set lifeModeSilenceTimer when we're INSIDE the block where lifeModeSearchDebounceTimer is set. So when we first enter, we don't have lifeModeSearchDebounceTimer yet - we're about to set it. So the condition "lifeModeSearchDebounceTimer" would be false on first entry. So we need to start the silence timer in the block where we set the debounce timer. Let me add it there.
old8 = """          lifeModeQueryCountdownInterval = setInterval(() => {
            secLeft -= 1;
            if (secLeft >= 1) {
              updateLifeModeMic(secLeft, true);
            } else {
              if (lifeModeQueryCountdownInterval) {
                clearInterval(lifeModeQueryCountdownInterval);
                lifeModeQueryCountdownInterval = null;
              }
            }
          }, 1000);
          lifeModeSearchDebounceTimer = setTimeout(() => {"""
new8 = """          lifeModeQueryCountdownInterval = setInterval(() => {
            secLeft -= 1;
            if (secLeft >= 1) {
              updateLifeModeMic(secLeft, true);
            } else {
              if (lifeModeQueryCountdownInterval) {
                clearInterval(lifeModeQueryCountdownInterval);
                lifeModeQueryCountdownInterval = null;
              }
            }
          }, 1000);
          if (lifeModeSilenceTimer) clearTimeout(lifeModeSilenceTimer);
          lifeModeSilenceTimer = setTimeout(() => {
            if (!lifeModeSearchDebounceTimer) return;
            lifeModeSearchDebounceTimer = null;
            if (lifeModeQueryCountdownInterval) { clearInterval(lifeModeQueryCountdownInterval); lifeModeQueryCountdownInterval = null; }
            if (!isLifeModeListening) return;
            lifeModeQueryCooldownUntil = Date.now() + LIFE_MODE_QUERY_COOLDOWN_MS;
            const q = capQueryForScreen(lifeModeCurrentDisplay);
            if (q.length >= 2) lifeModeSearchAndPlay(q);
            fullTranscript = '';
            lifeModeCurrentDisplay = '';
            if (lifeModeRecognition && isLifeModeListening) lifeModeRecognition.abort();
            if (lifeModeWordsEl) lifeModeWordsEl.classList.remove('visible');
            let cooldownSec = Math.ceil(LIFE_MODE_QUERY_COOLDOWN_MS / 1000);
            if (lifeModeCooldownCountdownInterval) clearInterval(lifeModeCooldownCountdownInterval);
            updateLifeModeMic(cooldownSec, false, 'until next');
            lifeModeCooldownCountdownInterval = setInterval(() => {
              if (!isLifeModeListening) { clearInterval(lifeModeCooldownCountdownInterval); lifeModeCooldownCountdownInterval = null; return; }
              cooldownSec -= 1;
              if (cooldownSec >= 1) { updateLifeModeMic(cooldownSec, false, 'until next'); } else {
                if (lifeModeCooldownCountdownInterval) { clearInterval(lifeModeCooldownCountdownInterval); lifeModeCooldownCountdownInterval = null; }
                updateLifeModeMic(null, true);
              }
            }, 1000);
          }, LIFE_MODE_SILENCE_MS);
          lifeModeSearchDebounceTimer = setTimeout(() => {"""
if old8 in content and new8 not in content:
    content = content.replace(old8, new8)
    print("8. Added silence timer start")
else:
    print("8. Silence timer start pattern not found")

# 9. In the main debounce callback, clear silence timer when it fires
old9 = """          lifeModeSearchDebounceTimer = setTimeout(() => {
            lifeModeSearchDebounceTimer = null;
            if (lifeModeQueryCountdownInterval) {
              clearInterval(lifeModeQueryCountdownInterval);
              lifeModeQueryCountdownInterval = null;
            }
            if (!isLifeModeListening) return;"""
new9 = """          lifeModeSearchDebounceTimer = setTimeout(() => {
            lifeModeSearchDebounceTimer = null;
            if (lifeModeSilenceTimer) { clearTimeout(lifeModeSilenceTimer); lifeModeSilenceTimer = null; }
            if (lifeModeQueryCountdownInterval) {
              clearInterval(lifeModeQueryCountdownInterval);
              lifeModeQueryCountdownInterval = null;
            }
            if (!isLifeModeListening) return;"""
if old9 in content:
    content = content.replace(old9, new9)
    print("9. Clear silence timer in debounce callback")
else:
    print("9. Clear silence pattern not found")

# 10. Clear lifeModeSilenceTimer in stopLifeModeListening
old10 = "      if (lifeModeQueryCountdownInterval) {\n        clearInterval(lifeModeQueryCountdownInterval);\n        lifeModeQueryCountdownInterval = null;\n      }\n      if (lifeModeCooldownCountdownInterval) {"
new10 = "      if (lifeModeQueryCountdownInterval) {\n        clearInterval(lifeModeQueryCountdownInterval);\n        lifeModeQueryCountdownInterval = null;\n      }\n      if (lifeModeSilenceTimer) {\n        clearTimeout(lifeModeSilenceTimer);\n        lifeModeSilenceTimer = null;\n      }\n      if (lifeModeCooldownCountdownInterval) {"
if old10 in content:
    content = content.replace(old10, new10)
    print("10. Clear silence timer in stop")
else:
    print("10. Stop clear pattern not found")

with open(path, "w") as f:
    f.write(content)
print("Done.")
