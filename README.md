# 🙏 Bible Presenter - Tamil Church Presentation Software

**An open-source, free presentation software designed specifically for Tamil Christian churches to display Bible verses, song lyrics, and announcements during worship services.**

> Built with love for **நல்ல சமாரியன் இயேசு ஜெப வீடு** (Good Samaritan Jesus Prayer House) and shared freely with the Tamil Christian community worldwide.

---

## 🌟 Why This Application?

**Problem:** Tamil churches need a simple, reliable way to present Tamil Bible verses and songs during services without expensive software licenses.

**Solution:** Bible Presenter is a completely free, web-based application that runs locally on any computer. No installation, no subscriptions, no internet required during services.

### ✨ Key Features

- 📖 **Complete Tamil Bible** - Quick verse lookup and beautiful presentation
- 🎵 **Tamil Song Database** - Search and display worship songs instantly  
- 🎨 **Beautiful Templates** - Pre-designed slides for announcements, offerings, special occasions
- 💾 **Auto-Save to Church Backup** - Never lose your presentation files
- 📱 **Phone Remote Control** - Control presentations from your phone
- 🎤 **Voice Control** - Hands-free presentation navigation (optional)
- 🔄 **Import/Export** - Save presentations for each service
- 🌈 **Rainbow Text Effects** - Eye-catching colorful text for titles

---

## 🚀 Quick Start (3 Steps)

### Step 1: Download & Extract
1. Download this repository as ZIP or clone it:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Bible_Presenter.git
   ```
2. Extract to any folder (e.g., `C:\Church\Bible_Presenter`)

### Step 2: Start the Application
**Option A - Simple (Double-click):**
- Double-click `start_localhost.bat` 
- Browser opens automatically at `http://127.0.0.1:5500`

**Option B - Full Features (Recommended):**
- Double-click `start_all.bat`
- This starts:
  - Web server (localhost:5500)
  - Remote control server (for phone control)
  - Auto-saves presentations to `Church Backup/` folder

### Step 3: Start Presenting!
- Click `📖 பரிசுத்த வேதாகமம்` to add Bible verses
- Click `🎵 பாடல் புத்தகம்` to add songs
- Click `▶ Present` to start showing slides

**That's it!** No installation, no configuration needed.

---

## 📖 Complete Feature Guide

### 🎯 Main Interface Overview

The application has three main areas:

1. **Left Panel** - List of all slides (drag to reorder)
2. **Center** - Live preview of current slide
3. **Right Panel** - Bible search, song search, or slide editor

### 🎛️ Top Toolbar Buttons

| Button | Function | When to Use |
|--------|----------|-------------|
| `+ HTML Slide` | Create custom slide with HTML | Special announcements, videos |
| `+ Media Slide` | Create video/image slide | Background videos, photos |
| `+ Text Slide` | Simple text slide | Announcements, plain text |
| `✦ வசனம்` | Quick Bible verse slide | Add a verse with custom styling |
| `⬇ Export` | Save presentation | End of service to backup |
| `⬆ Import` | Load saved presentation | Start of service or reuse |
| `▶ Present` | Start presentation mode | Begin service |
| `📖 பரிசுத்த வேதாகமம்` | Open Tamil Bible panel | Find and add verses |
| `🎵 பாடல் புத்தகம்` | Open song database | Search worship songs |
| `⌨ Shortcuts` | View keyboard shortcuts | Learn faster navigation |
| `🖼 Extract Verses` | Extract verses from image | OCR from photos (requires AI) |
| `✕ Delete` | Delete current slide | Remove mistake |
| `✕ Delete Range` | Delete multiple slides | Clean up presentation |

---

## 📚 Common Workflows

### 🙏 Sunday Service Preparation

1. **Start Application:** Run `start_all.bat`

2. **Add Opening Song:**
   - Click `🎵 பாடல் புத்தகம்`
   - Type song name in search
   - Click `Add to Slides` button

3. **Add Bible Reading:**
   - Click `📖 பரிசுத்த வேதாகமம்`
   - Select Book (e.g., மத்தேயு - Matthew)
   - Select Chapter (e.g., 5)
   - Click verses you want (they highlight)
   - Click `+ வசனங்களை சேர்க்கவும்` (Add Verses)

4. **Add Announcements:**
   - Click `+ Text Slide`
   - Enter title: "அறிவிப்பு" (Announcement)
   - Enter body text
   - Choose colors
   - Click `Apply →`

5. **Save Presentation:**
   - Click `⬇ Export`
   - Select "Export All Slides"
   - Click `⬇ Export →`
   - File saves automatically to `Church Backup/presentation_DD_MM_YYYY.prsn`

6. **Present:**
   - Connect projector/TV
   - Click `▶ Present`
   - Use arrow keys or mouse to navigate slides

### 🔄 Reusing Saved Presentations

**Load last week's presentation:**
1. Click `⬆ Import`
2. Click `Browse...`
3. Navigate to `Church Backup/` folder
4. Select the `.prsn` file
5. Choose "Replace All" or "Append to End"
6. Click `⬆ Import →`

---

## 💾 Export & Backup System

### Automatic Church Backup

**When `start_all.bat` is running:**
- All exports automatically save to `Church Backup/` folder
- Files are named: `presentation_DD_MM_YYYY.prsn`

**File Conflict Detection:**
- If file already exists today, you get a warning with 3 options:
  - **✓ Save as New** - Saves as `presentation_DD_MM_YYYY(1).prsn`
  - **🔍 Compare** - Checks if slides are duplicate or different
  - **Cancel** - Abort export

**Benefits:**
- Never lose presentations
- Track all services
- Easy to find and reuse old presentations

---

## 📱 Phone Remote Control

**Control presentations from your phone during service!**

### Setup (One-time):
1. Make sure `start_all.bat` is running
2. Click the phone icon in the top toolbar
3. Scan QR code with phone OR copy the URL
4. Open URL in phone browser
5. Keep phone screen open

### Usage:
- **Swipe left/right** or tap arrows to change slides
- **Tap slide numbers** to jump directly
- **View current slide** preview on phone
- **See bookmarks** for quick navigation

**Perfect for:** Walking around during worship while controlling slides!

---

## ⌨️ Keyboard Shortcuts

### During Presentation Mode:
| Key | Action |
|-----|--------|
| `→` or `Space` | Next slide |
| `←` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `Esc` | Exit presentation |
| `B` | Toggle bookmark on current slide |

### In Editor:
| Key | Action |
|-----|--------|
| `Ctrl + S` | Save presentation |
| `Delete` | Delete current slide |
| `Ctrl + ←/→` | Navigate slides |

---

## 🎨 Using Pre-made Templates

The `Html Untouched/` folder contains beautiful ready-to-use slides:

1. **Announcement Slides:**
   - `announcement_updated.html` - Modern announcement template

2. **Special Occasions:**
   - `church_title_rainbow.html` - Rainbow church title (beautiful!)
   - `offering_fixed_final.html` - Offering slide
   - `birthday_anniversary_updated.html` - Birthday/anniversary

3. **Event-Specific:**
   - `moving palm day -.html` - Palm Sunday
   - `womensday.html` - Women's Day celebration

**How to Use:**
1. Click `+ HTML Slide`
2. Open one of these HTML files in Notepad
3. Copy all content (Ctrl+A, Ctrl+C)
4. Paste into the HTML editor
5. Click `Apply →`

---

## 🔧 Advanced Features

### 🎤 Voice Control (Optional)
- Run `start_voice_control.bat` for hands-free control
- Say commands like "next slide", "previous slide"
- Requires microphone setup

### 🤖 AI Verse Extraction (Optional)
- Click `🖼 Extract Verses` button
- Upload photo of Bible page
- AI extracts text automatically
- Requires AI server setup (see `ai_config.js`)

### 🎵 Adding New Songs
1. Click `🎵 பாடல் புத்தகம்`
2. Click `➕ New Song` button
3. Fill in song details
4. Song saves to database permanently

---

## 🐛 Troubleshooting

### Application won't start
**Problem:** Double-clicking `.bat` files does nothing  
**Solution:** Install Python 3 from [python.org](https://python.org)

### Bible/Songs not showing
**Problem:** Empty panels  
**Solution:** Make sure `bible_content.js` and `song_content.js` exist in the folder

### Export not saving to Church Backup
**Problem:** File saves to Downloads folder  
**Solution:** 
1. Make sure `start_remote_control.bat` is running
2. Or click "📁 Select folder" when prompted and choose `Church Backup`

### Presentation mode shows blank screen
**Problem:** Second monitor not detected  
**Solution:** Press `Windows + P` and select "Extend" display mode

### Phone remote not connecting
**Problem:** QR code doesn't work  
**Solution:**
1. Make sure computer and phone are on same WiFi
2. Manually type the URL shown (e.g., `http://192.168.1.100:8788`)

---

## 📁 Folder Structure

```
Bible_Presenter/
├── index.html              # Main application
├── app.js                  # Core logic
├── styles.css              # Styling
├── bible_content.js        # Tamil Bible database
├── song_content.js         # Tamil song database
├── Church Backup/          # Auto-save presentations here
├── Html Untouched/         # Pre-made slide templates
├── start_localhost.bat     # Simple start (basic features)
├── start_all.bat          # Full start (all features)
├── start_remote_control.bat # Remote control server only
└── README.md              # This file
```

---

## 🤝 Contributing

This is an **open-source project for Tamil churches**. Contributions welcome!

### How to Help:
- 🐛 **Report bugs** - Create an issue on GitHub
- ✨ **Suggest features** - Share your ideas
- 🎨 **Create templates** - Design new slide styles
- 📖 **Add verses** - Improve Bible database
- 🎵 **Add songs** - Expand song collection
- 🌍 **Translate** - Help translate to other Indian languages

### Development Setup:
```bash
git clone https://github.com/YOUR_USERNAME/Bible_Presenter.git
cd Bible_Presenter
# Make your changes
# Test by running start_localhost.bat
git commit -m "Your improvement"
git push origin main
```

---

## 📜 License

**Free and Open Source**

This software is provided free of charge for use by Tamil Christian churches worldwide. You may:
- ✅ Use it for free in your church
- ✅ Modify it for your needs
- ✅ Share it with other churches
- ✅ Contribute improvements

**Attribution:** Built by the Tamil Christian community for the Tamil Christian community.

---

## 💬 Support & Community

### Need Help?
- 📧 **Email:** **menavinrajr1998@gmail.com** (for any questions or support)
- 💬 **WhatsApp Group:** navinrajr1998@gmail.com
- 🐛 **Bug Reports:** navinrajr1998@gmail.com

### Share Your Experience!
If this software blesses your church, please:
- ⭐ Star this repository on GitHub
- 📢 Share with other Tamil churches
- 📸 Send us photos of your setup (navinrajr1998@gmail.com Im so happy to see)

---

## 🙏 Acknowledgments

**Built with gratitude for:**
- நல்ல சமாரியன் இயேசு ஜெப வீடு (Good Samaritan Jesus Prayer House)
- All Tamil churches using this software
- Contributors who improve this tool
- God's grace that enables this ministry

---

## 📞 Quick Reference Card

**Print this and keep near your computer!**

```
QUICK START:
1. Run: start_all.bat
2. Add slides using Bible/Song panels
3. Click: ▶ Present

KEYBOARD SHORTCUTS:
→ / Space = Next slide
← = Previous slide
Esc = Exit presentation

SAVE PRESENTATION:
Click: ⬇ Export → Church Backup folder

LOAD PRESENTATION:
Click: ⬆ Import → Select .prsn file

PHONE CONTROL:
Click phone icon → Scan QR code
```

---

**May God bless your ministry! 🙏**

**Contact:** For any questions, support, or feedback - **navinrajr1998@gmail.com**

*For technical support, suggestion and updates, visit: contact email thanks!