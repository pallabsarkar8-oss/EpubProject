/**
 * reader-engine.js
 * Drives ePub instances, text selection processing overlays, 
 * theme switching pipelines, and real-time database definitions.
 */

const databaseURLs = [
    "https://dictionarybntobn-default-rtdb.firebaseio.com",
    "https://bndictionary-default-rtdb.asia-southeast1.firebasedatabase.app"
];

// Global runtime memory pointers tracking application operations
let currentBook = null;
let currentRendition = null;
let currentBookId = "";
let readerFontSize = 100;
let lastSelectedText = "";
let lastCfiRange = null;
let lastContents = null;
let activeHighlights = {};

/**
 * Firebase Realtime Dictionary parsing interface using Prefix Matching rules
 */
window.searchInFirebaseDictionary = async function(word) {
    const cleanedWord = word
        .trim()
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "");

    if (!cleanedWord) return null;

    const startWord = cleanedWord;
    const endWord = cleanedWord + "\uf8ff";

    try {
        const requests = databaseURLs.map(url => {
            const queryUrl = `${url}/dictionary.json?orderBy="$key"&startAt="${encodeURIComponent(startWord)}"\&endAt="${encodeURIComponent(endWord)}"`;
            
            return fetch(queryUrl)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        });

        const results = await Promise.all(requests);

        for (const data of results) {
            if (data && Object.keys(data).length > 0) {
                let output = "";
                for (const [key, value] of Object.entries(data)) {
                    const meaning = value.meaning || value;
                    output += `<strong>${key}</strong>: ${meaning}<br>`;
                }
                return output;
            }
        }
        return "অভিধানে এই অংশ দিয়ে শুরু হওয়া কোনো শব্দ খুঁজে পাওয়া যায়নি।";
    } catch (error) {
        console.error(error);
        return "অর্থ খোঁজার সময় সার্ভারে ত্রুটি ঘটেছে।";
    }
};

/**
 * Main function managing initial presentation settings for new eBook instances
 */
function openInFreshReader(url) {
    if (currentBook) { currentBook.destroy(); }
    currentBook = ePub(url);
    document.getElementById('epub-viewer').innerHTML = "";
    document.getElementById('toc-list-items').innerHTML = "<li>লোড হচ্ছে...</li>";

    currentRendition = currentBook.renderTo("epub-viewer", {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated"
    });

    const savedLocation = localStorage.getItem('book_progress_' + currentBookId);
    currentRendition.display(savedLocation || undefined);

    // Asynchronously resolve navigation components (Table of Contents)
    currentBook.loaded.navigation.then(function(toc) {
        const tocContainer = document.getElementById('toc-list-items');
        tocContainer.innerHTML = ""; 

        if (toc && toc.length > 0) {
            toc.forEach(function(chapter) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = chapter.label.trim();
                a.classList.add('toc-item');
                a.href = "#";
                
                a.addEventListener('click', function(e) {
                    e.preventDefault();
                    currentRendition.display(chapter.href);
                    if (window.innerWidth <= 768) {
                        document.getElementById('reader-toc-sidebar').classList.add('hidden');
                        document.getElementById('toggle-toc-btn').classList.remove('active');
                    }
                });

                li.appendChild(a);
                tocContainer.appendChild(li);
            });
        } else {
            tocContainer.innerHTML = "<li style='padding:10px; opacity:0.6;'>কোনো সূচিপত্র পাওয়া যায়নি।</li>";
        }
    }).catch(() => {
        document.getElementById('toc-list-items').innerHTML = "<li style='padding:10px; color:#e74c3c;'>সূচিপত্র লোড করতে ব্যর্থ।</li>";
    });

    // Tracking progress markers inside LocalStorage space
    currentRendition.on('relocated', function(location) {
        localStorage.setItem('book_progress_' + currentBookId, location.start.cfi);
        hideSelectionMenu();
    });

    // Capture text-selection actions contextually inside the iframe container document
    currentRendition.on("selected", function(cfiRange, contents) {
        const selectedText = contents.window.getSelection().toString().trim();
        if (selectedText.length > 0 && selectedText.length < 2000) {
            lastSelectedText = selectedText;
            lastCfiRange = cfiRange;
            lastContents = contents;

            const iframe = document.querySelector('#epub-viewer iframe');
            if (iframe) {
                const rect = contents.window.getSelection().getRangeAt(0).getBoundingClientRect();
                const iframeRect = iframe.getBoundingClientRect();
                
                const menu = document.getElementById('selection-menu');
                menu.style.display = 'flex';
                
                let topPos = rect.top + iframeRect.top - 45;
                let leftPos = rect.left + iframeRect.left + (rect.width / 2) - (menu.offsetWidth / 2);
                
                if (topPos < 50) topPos = rect.bottom + iframeRect.top + 10;
                if (leftPos < 10) leftPos = 10;

                menu.style.top = topPos + 'px';
                menu.style.left = leftPos + 'px';
            }
        } else {
            hideSelectionMenu();
        }
    });

    currentRendition.on("keyup", handleKeyboardNavigation);
    
}

function hideSelectionMenu() {
    const menu = document.getElementById('selection-menu');
    if (menu) menu.style.display = 'none';
}

function clearEpubSelection() {
    if (lastContents) {
        lastContents.window.getSelection().removeAllRanges();
    }
}

function handleKeyboardNavigation(e) {
    if (!currentRendition) return;
    if (e.key === "ArrowLeft") currentRendition.prev();
    if (e.key === "ArrowRight") currentRendition.next();
}

/**
 * Asynchronously searches the Wikipedia Rest API engine using standard parameters
 */
async function showWikipediaPopup(word) {
    const modal = document.getElementById('dict-modal');
    const wordElem = document.getElementById('popup-word');
    const meaningElem = document.getElementById('popup-meaning');

    wordElem.innerText = `উইকিপিডিয়া অনুসন্ধান: "${word}"`;
    meaningElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> উইকিপিডিয়াতে খোঁজা হচ্ছে...`;
    
    meaningElem.style.maxHeight = "300px";
    meaningElem.style.overflowY = "auto";
    modal.style.display = "block";

    try {
        const wikiUrl = `https://bn.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
        const response = await fetch(wikiUrl);
        
        if (response.ok) {
            const data = await response.json();
            if (data.extract_html) {
                meaningElem.innerHTML = data.extract_html;
            } else if (data.extract) {
                meaningElem.innerText = data.extract;
            } else {
                meaningElem.innerText = "উইকিপিডিয়াতে এই বিষয়ে কোনো সংক্ষিপ্ত বিবরণ পাওয়া যায়নি।";
            }
        } else {
            meaningElem.innerText = "উইকিপিডিয়াতে এই নামে কোনো নিবন্ধ খুঁজে পাওয়া যায়নি।";
        }
    } catch (error) {
        console.error(error);
        meaningElem.innerText = "উইকিপিডিয়া থেকে তথ্য লোড করার সময় সমস্যা হয়েছে।";
    }
}

async function showDictionaryPopup(word) {
    const modal = document.getElementById('dict-modal');
    const wordElem = document.getElementById('popup-word');
    const meaningElem = document.getElementById('popup-meaning');

    wordElem.innerText = `"${word}" দিয়ে শুরু হওয়া শব্দসমূহ`; 
    meaningElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> অভিধানে খোঁজা হচ্ছে...`;
    
    meaningElem.style.maxHeight = "300px"; 
    meaningElem.style.overflowY = "auto";  
    modal.style.display = "block";

    if (typeof window.searchInFirebaseDictionary === "function") {
        const meaning = await window.searchInFirebaseDictionary(word);
        meaningElem.innerHTML = meaning; 
    } else {
        meaningElem.innerText = "Firebase কানেক্ট করা নেই।";
    }
}

// Initialize operational bindings for UI action elements
document.addEventListener("DOMContentLoaded", () => {
	

   // --- লোকাল ইপাব ফাইল আপলোড এবং সরাসরি রিড করার লজিক ---
    const localUploadInput = document.getElementById('local-epub-upload');
    if (localUploadInput) {
        localUploadInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.name.endsWith('.epub')) {
                alert('অনুগ্রহ করে একটি বৈধ .epub ফাইল নির্বাচন করুন।');
                return;
            }

            // ১. পূর্বের কোনো বই ওপেন থাকলে তা মেমোরি থেকে সম্পূর্ণ ডিলিট করা
            if (currentBook) {
                currentBook.destroy();
                currentRendition = null;
            }

            // ২. ফাইলটিকে ArrayBuffer হিসেবে রিড করার জন্য FileReader ব্যবহার
            const reader = new FileReader();
            reader.onload = function(event) {
                const bookData = event.target.result;

                // ৩. ePub.js ইঞ্জিনে সরাসরি ArrayBuffer ডেটা পাস করা
                currentBook = ePub(bookData);
                currentBookId = "local_" + encodeURIComponent(file.name);

                // ৪. রিডার ইন্টারফেস শো করা
                document.body.style.overflow = "hidden";
                document.getElementById('fullscreen-reader').style.display = "flex";

                // ৫. বইয়ের পাতা রেন্ডার করা (#epub-viewer কন্টেইনারে)
                currentRendition = currentBook.renderTo("epub-viewer", {
                    width: "100%",
                    height: "100%",
                    spread: "none"
                });

                currentRendition.display();

                // ৬. সূচিপত্র (TOC) লোড এবং জেনারেট করা
                currentBook.loaded.navigation.then(function(nav) {
                    const tocContainer = document.getElementById('toc-list-items');
                    if (tocContainer) {
                        tocContainer.innerHTML = ""; // আগের সূচি পরিষ্কার করা
                        
                        nav.forEach(function(chapter) {
                            const li = document.createElement('li');
                            const a = document.createElement('a');
                            a.textContent = chapter.label.trim();
                            a.href = "#";
                            
                            // সূচিপত্রের লিংকে ক্লিক করলে সেই অধ্যায়ে চলে যাওয়ার লজিক
                            a.addEventListener('click', function(e) {
                                e.preventDefault();
                                if (currentRendition) {
                                    currentRendition.display(chapter.href);
                                }
                            });
                            
                            li.appendChild(a);
                            tocContainer.appendChild(li);
                        });
                    }
                });

                

                // ৭. থিম এবং ফন্ট সেটিংস পুনরায় অ্যাপ্লাই করা (ডিফল্ট)
                currentRendition.themes.fontSize(`${readerFontSize}%`);
                // আপনার থিম সিলেকশন অনুযায়ী কালার সেট করা
                const activeTheme = document.getElementById('fullscreen-reader').getAttribute('data-reader-theme') || 'light';
                if (activeTheme === 'dark') {
                    currentRendition.themes.override("color", "#e0e0e0");
                    currentRendition.themes.override("background", "#121212");
                } else if (activeTheme === 'sepia') {
                    currentRendition.themes.override("color", "#5b4636");
                    currentRendition.themes.override("background", "#f4ecd8");
                } else {
                    currentRendition.themes.override("color", "#222222");
                    currentRendition.themes.override("background", "#ffffff");
                }
            };

            // ফাইলটিকে বাইনারি মেমোরি বা বাফার হিসেবে ব্রাউজারে রিড করানো হচ্ছে
            reader.readAsArrayBuffer(file);

            // একই ফাইল পরে আবার আপলোড করার সুবিধার্থে ইনপুট ফাঁকা করা
            this.value = "";
        });
    }

    // নেক্সট এবং প্রিভিয়াস পেজ বাটনের লজিক (যদি আগে থেকে কানেক্টেড না থাকে)
    const nextBtn = document.getElementById('r-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => { if (currentRendition) currentRendition.next(); });
    }
    const prevBtn = document.getElementById('r-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => { if (currentRendition) currentRendition.prev(); });
    }


	
	/**
 * ePub বইয়ের ভেতরে টেক্সট অনুসন্ধান করার মূল ফাংশন
 */
async function searchInEpub(query) {
    if (!currentBook || !query) return;

    const meaningElem = document.getElementById('popup-meaning');
    const wordElem = document.getElementById('popup-word');
    const modal = document.getElementById('dict-modal');

    wordElem.innerText = `বইয়ে অনুসন্ধান: "${query}"`;
    meaningElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> পুরো বইয়ে খোঁজা হচ্ছে...`;
    modal.style.display = "block";

    // বইয়ের প্রতিটি চ্যাপ্টার/স্পাইন লোড করে সমান্তরালভাবে খোঁজা
    const searchPromises = currentBook.spine.spineItems.map(item => 
        item.load(currentBook.load.bind(currentBook))
            .then(item.find.bind(item, query))
            .then(results => {
                item.unload(); // মেমোরি বাঁচানোর জন্য আনলোড করা
                return results;
            })
    );

    const allResults = await Promise.all(searchPromises);
    const mergedResults = [].concat.apply([], allResults);

    if (mergedResults.length === 0) {
        meaningElem.innerHTML = `<p style="color: #e74c3c;">বইয়ের কোথাও এই শব্দটি খুঁজে পাওয়া যায়নি।</p>`;
        return;
    }

    // ফলাফলের তালিকা তৈরি করা
    meaningElem.innerHTML = "";
    const listContainer = document.createElement('ul');
    listContainer.style.listStyle = "none";
    listContainer.style.padding = "0";

    mergedResults.forEach(result => {
        const li = document.createElement('li');
        li.style.padding = "8px 0";
        li.style.borderBottom = "1px solid rgba(0,0,0,0.05)";
        li.style.cursor = "pointer";
        
        // ম্যাচ হওয়া টেক্সটের চারপাশের কিছু অংশ দেখানো ও হাইলাইট করা
        let excerpt = result.excerpt.replace(new RegExp(query, 'gi'), match => `<mark style="background: yellow; color: black; font-weight: bold;">${match}</mark>`);
        li.innerHTML = `... ${excerpt} ...`;

        // কোনো ফলাফলে ক্লিক করলে পাঠককে সরাসরি সেই পাতায় নিয়ে যাবে
        li.addEventListener('click', () => {
            if (currentRendition) {
                currentRendition.display(result.cfi);
                modal.style.display = "none"; // নেভিগেট করার পর পপআপ বন্ধ হবে
            }
        });
        listContainer.appendChild(li);
    });

    meaningElem.appendChild(listContainer);
}

// ইনপুট ফিল্ড ও আইকনের সাথে ইভেন্ট লিসেনার যুক্ত করা (DOM Ready এর ভেতর রাখুন)
document.getElementById('epub-internal-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchInEpub(this.value.trim());
    }
});

document.getElementById('exec-epub-search').addEventListener('click', function() {
    const query = document.getElementById('epub-internal-search').value.trim();
    searchInEpub(query);
});
	
	
    // Open reader execution interface maps
    document.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', function() {
            currentBookId = this.getAttribute('data-id');
            const bookUrl = this.getAttribute('data-url');
            
            document.body.style.overflow = "hidden";
            document.getElementById('fullscreen-reader').style.display = "flex";

            openInFreshReader(bookUrl);
        });
    });

    // Control triggers mapping configurations
    document.getElementById('menu-search-btn').addEventListener('click', () => {
        hideSelectionMenu();
        showDictionaryPopup(lastSelectedText);
    });

    document.getElementById('menu-highlight-btn').addEventListener('click', () => {
        hideSelectionMenu();
        if (currentRendition && lastCfiRange) {
            currentRendition.annotations.highlight(lastCfiRange, {}, (e) => {}, "selected-highlight", {"fill": "rgba(255, 102, 102, 0.7)"});
            clearEpubSelection();
        }
    });

    document.getElementById('menu-copy-btn').addEventListener('click', () => {
        hideSelectionMenu();
        navigator.clipboard.writeText(lastSelectedText).then(() => {
            alert('লেখাটি কপি করা হয়েছে!');
            clearEpubSelection();
        }).catch(err => {
            console.error('কপি করতে ব্যর্থ: ', err);
        });
    });

    document.getElementById('menu-wiki-btn').addEventListener('click', () => {
        hideSelectionMenu();
        showWikipediaPopup(lastSelectedText);
    });

    document.getElementById('toggle-toc-btn').addEventListener('click', function() {
        const sidebar = document.getElementById('reader-toc-sidebar');
        sidebar.classList.toggle('hidden');
        this.classList.toggle('active');
    });

    document.getElementById('close-dict-btn').addEventListener('click', () => {
        document.getElementById('dict-modal').style.display = "none";
        clearEpubSelection();
    });

    document.addEventListener("keyup", handleKeyboardNavigation);

    // Theme Selector control engine iteration loop
    document.querySelectorAll('.theme-select').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTheme = this.getAttribute('data-theme');
            document.getElementById('fullscreen-reader').setAttribute('data-reader-theme', targetTheme);
            if (currentRendition) {
                if (targetTheme === 'dark') {
                    currentRendition.themes.override("color", "#e0e0e0");
                    currentRendition.themes.override("background", "#121212");
                } else if (targetTheme === 'sepia') {
                    currentRendition.themes.override("color", "#5b4636");
                    currentRendition.themes.override("background", "#f4ecd8");
                } else {
                    currentRendition.themes.override("color", "#222222");
                    currentRendition.themes.override("background", "#ffffff");
                }
            }
        });
    });

    // Font Controls Setup
    document.getElementById('r-zoom-in').addEventListener('click', () => { if (currentRendition) { readerFontSize += 10; currentRendition.themes.fontSize(`${readerFontSize}%`); } });
    document.getElementById('r-zoom-out').addEventListener('click', () => { if (currentRendition) { readerFontSize -= 10; currentRendition.themes.fontSize(`${readerFontSize}%`); } });

    // Terminal execution interface closure sequence
    document.getElementById('close-reader-btn').addEventListener('click', () => {
        document.getElementById('fullscreen-reader').style.display = "none";
        document.getElementById('dict-modal').style.display = "none";
        hideSelectionMenu();
        document.body.style.overflow = "auto";
        if (currentBook) { currentBook.destroy(); currentRendition = null; }
    });
});