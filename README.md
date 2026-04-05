# Bible & Presentation Software 

Welcome to the **Church Presentation Software**, a customized solution designed specially for "நல்ல சமாரியன் இயேசு ஜெப வீடு" (Good Samaritan Jesus Prayer House). This tool allows users to manage and present Bible verses, song lyrics, and custom slides directly through a simple web-based interface.

---

## 📸 Main User Interface Overview

*(Placeholder for UI Screenshot here - recommend inserting an image pointing to the top bar, center preview, and sidebars)*
`[Insert Screenshot Here: UI Overview with arrows pointing to buttons]`

The application screen is divided into the following main areas:
1. **Top Control Bar:** Holds all the primary action buttons for adding, importing/exporting, and presenting slides.
2. **Left Panel (Slide List):** Shows a preview of all slides currently loaded. Allows easy reordering and quick navigation (Go To #).
3. **Center Area (Preview):** Live preview of the currently selected slide.
4. **Right Panel (Editor / Bible / Song Panels):** Context-aware area to edit the current slide or search for/add verses and songs.

---

## 🎛️ Top Bar Buttons & Their Functions (CRUD & Actions)

Here is a step-by-step breakdown of every button available in the top bar:

### 1. Slide Creation (Create)
*   **`+ HTML Slide`**: Creates a new blank slide using raw HTML formatting. Useful for advanced layouts (videos, custom images).
*   **`+ Text Slide`**: Creates a new simple text slide where you can enter a Title and Body Text, and pick background/text colors easily without code.
*   **`✦ வசனம் (Vasanam Custom)`**: Opens a quick modal to construct a custom Bible verse slide manually.

### 2. Import & Export (Save / Load)
*   **`⬇ Export`**: Saves your current presentation locally. It opens a modal allowing you to export "All Slides" or a "Page Range" to a `.prsn` format file. This acts as a backup for specific Sundays/events.
*   **`⬆ Import`**: Loads a previously saved `.prsn` file. You will be prompted to either "Replace All" existing slides or "Append to End".

### 3. Presentation Controls
*   **`▶ Present`**: Triggers the presentation mode (usually opens a new window or goes fullscreen) to project the slides to the audience monitor.

### 4. Side Panels (Read / Search)
*   **`📖 பரிசுத்த வேதாகமம் (Holy Bible)`**: Toggles the Bible panel on the right side. Allows you to select Book, Chapter, and Verse and directly inject it into the slide queue.
*   **`🎵 பாடல் புத்தகம் (Song Book)`**: Toggles the Song panel. Allows searching and adding standard worship songs directly to the presentation slides.

### 5. Utility & Deletion (Delete / Manage)
*   **`⌨ Shortcuts`**: Displays helpful keyboard shortcuts for fast operation during a live event.
*   **`✕ Delete`**: Deletes the currently selected slide.
*   **`✕ Delete Range`**: Opens a prompt to delete a specific block of slides by page numbers.

---

## 📝 Step-by-Step CRUD Operations Guide

### Step 1: CREATE (Add New Slides)
1. Click **`+ Text Slide`** for simple announcements.
2. The Editor Panel will appear on the right.
3. Fill in the "Title" and "Body Text".
4. Pick background and text colors using the color selectors.
5. Click **`Apply →`** to save the changes to the slide. The center preview will update instantly.

*(To add Bible verses, toggle the `📖 பரிசுத்த வேதாகமம்` panel, find your verse, and click the add button next to it)*

### Step 2: READ (Navigate & Preview)
*   **Select a slide:** Click any slide in the Left Slide List to preview it in the center.
*   **Jump to a slide:** Use the `Go to #` input box in the left panel, type a number, and press Enter.

### Step 3: UPDATE (Edit Existing Slides)
1. Select the slide you want to edit from the Left Panel.
2. The Editor Panel (Right Side) will load the current slide's content.
3. Modify the text, color, or HTML code.
4. Click **`Apply →`** to lock in your changes.

### Step 4: DELETE (Remove Slides)
*   **Delete Single Slide:** Select the slide you want to discard and click **`✕ Delete`** in the Top Bar.
*   **Delete Multiple:** Click **`✕ Delete Range`**, enter the start and end slide numbers, and confirm.

---

## 🛠️ Advanced Features (Behind the Scenes)

*   **Local ASR server Setup:** The repository contains `start_local_asr_whispercpp.bat` indicating support for local automated speech recognition, likely for capturing live sermons or transcribing spoken word into text. Refer to `LOCAL_ASR_SETUP.md` for more technical details.
*   **Song Saver Tool:** Built-in Java module (`SongSaver.java`) mapped through `start_song_saver.bat` for saving custom songs persistently.
*   **HTML Templates:** Use the premade slides provided in the `Html Untouched/` folder to quickly copy-paste code for special days like Women's Day, Palm Sunday, Offering, etc., using the **`+ HTML Slide`** button.

---

*(Note to User: To visualize the arrows in your physical documentation, you can take a screenshot of your screen, paste it into Paint or any editor, draw red arrows pointing to the top bar buttons, and save it beside this README file!)*