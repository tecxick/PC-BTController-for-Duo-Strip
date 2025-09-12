# ELK-BLEDOM BLE Command Set

All commands must be **written to characteristic 0xFFF4**.  
Format: `7E ... EF`

---

## 1. Power
- Power-ON → `7E-04-04-01-FF-00-EF`  
- Power-OFF → `7E-04-04-00-FF-00-EF`  

---

## 2. Brightness
- Set-Brightness-[Level] → `7E-04-01-[00–64]-FF-00-EF`  
  - Example-50%-Brightness → `7E-04-01-32-FF-00-EF`  

---

## 3. Static-Colors
- Red → `7E-07-05-FF-00-00-00-EF`  
- Green → `7E-07-05-00-FF-00-00-EF`  
- Blue → `7E-07-05-00-00-FF-00-EF`  
- White → `7E-07-05-FF-FF-FF-00-EF`  
- Yellow → `7E-07-05-FF-FF-00-00-EF`  
- Cyan → `7E-07-05-00-FF-FF-00-EF`  
- Magenta → `7E-07-05-FF-00-FF-00-EF`  

*(Custom colors can be set by replacing `[R][G][B]` with values from `00`–`FF`.)*  

---

## 4. Modes-(Effects)
- Flash → `7E-04-03-25-FF-00-EF`  
- Strobe → `7E-04-03-26-FF-00-EF`  
- Fade → `7E-04-03-27-FF-00-EF`  
- Smooth → `7E-04-03-28-FF-00-EF`  

 ```
                        <option value="0">Pattern 0 (0x8D)</option>
                        <option value="1">Pattern 1 (0x8E)</option>
                        <option value="2">Pattern 2 (0x8F)</option>
                        <option value="3">Pattern 3 (0x90)</option>
                        <option value="4">Pattern 4 (0x91)</option>
                        <option value="5">Pattern 5 (0x92)</option>
                        <option value="6">Pattern 6 (0x93)</option>
                        <option value="7">Pattern 7 (0x94)</option>
                        <option value="8">Pattern 8 (0x95)</option>
                        <option value="9">Pattern 9 (0x96)</option>
                        <option value="10">Pattern 10 (0x97)</option>
                        <option value="11">Pattern 11 (0x98)</option>
                        <option value="12">Pattern 12 (0x99)</option>
                        <option value="13">Pattern 13 (0x9A)</option>
                        <option value="14">Pattern 14 (0x9B)</option>
                        <option value="15">Pattern 15 (0x9C)</option>
 ```

---

## 5. Speed-(for-Effects)
- Increase-Speed → `7E-04-02-01-FF-00-EF`  
- Decrease-Speed → `7E-04-02-00-FF-00-EF`  

---

## 6. Music/Audio-Reactive-(if-supported)
- Music-Mode-1 → `7E-04-05-01-FF-00-EF`  
- Music-Mode-2 → `7E-04-05-02-FF-00-EF`  
- Music-Mode-3 → `7E-04-05-03-FF-00-EF`  
- Music-Mode-4 → `7E-04-05-04-FF-00-EF`  

---

## 7. DIY/Custom-Scenes-(depends-on-firmware)
- Save-Custom-[Slot] → `7E-04-06-[Slot]-FF-00-EF`  
- Load-Custom-[Slot] → `7E-04-07-[Slot]-FF-00-EF`  

*(Slots are usually `01–05`.)*  

---

## 8. System-Info
- Read-Device-Info (via `0xFFF3`) → returns string like:  
  `SHY-V9.1.0R5778`  