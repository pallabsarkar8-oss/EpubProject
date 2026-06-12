/**
 * library-core.js
 * Controls dashboard views, keyword queries, and multi-category filtering engines.
 */

let selectedCategory = "all";

function filterBooks() {
    const searchTerm = document.getElementById('book-filter').value.toLowerCase().trim();
    
    // Monitors both syntax targets matching original setup overrides (.book-grid vs .books-grid)
    document.querySelectorAll('.book-grid .book-card, .books-grid .book-card').forEach(card => {
        const bookTitle = card.querySelector('.book-info h3').innerText.toLowerCase();
        const bookAuthor = card.querySelector('.book-info .author') ? card.querySelector('.book-info .author').innerText.toLowerCase() : "";
        const bookCat = card.getAttribute('data-category') || "";
        const bookCatLower = bookCat.toLowerCase();
        
        // ২ নম্বর শর্ত: সার্চ বারে বইয়ের নাম, লেখকের নাম ও ক্যাটাগরি অনুসারে খোঁজার সুবিধা
        const isSearchMatch = bookTitle.includes(searchTerm) || bookAuthor.includes(searchTerm) || bookCatLower.includes(searchTerm);
        const isCategoryMatch = (selectedCategory === "all") || (bookCat === selectedCategory);
        
        if (isSearchMatch && isCategoryMatch) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });

    // ক্যাটাগরি ফিল্টার একটিভ থাকলে "নতুন বই" সেকশনের টাইটেল হাইড/শো করার লজিক
    const latestSection = document.getElementById('latest-section');
    if (latestSection) {
        if (selectedCategory !== "all") {
            latestSection.style.display = "none"; // নির্দিষ্ট ক্যাটাগরি খুঁজলে আলাদা 'নতুন সেকশন' দেখানোর প্রয়োজন নেই
        } else {
            latestSection.style.display = "block";
        }
    }
}

// Bind initialization handlers for the operational DOM UI elements
document.addEventListener("DOMContentLoaded", () => {

    // --- নতুন বই স্বয়ংক্রিয়ভাবে যুক্ত করার লজিক ---
    const mainGrid = document.getElementById('books-grid');
    const latestGrid = document.getElementById('latest-grid');

    if (mainGrid && latestGrid) {
        // সকল বইয়ের তালিকা থেকে প্রথম ৩টি বইয়ের ক্লোন বা কপি নেওয়া হচ্ছে
        const allBooks = mainGrid.querySelectorAll('.book-card');
        const numberOfLatestBooks = 6; // আপনি কয়টি নতুন বই দেখাতে চান তা এখানে ঠিক করুন

        for (let i = 0; i < Math.min(allBooks.length, numberOfLatestBooks); i++) {
            // true দেওয়ার অর্থ হলো কার্ডের ভেতরের সব উপাদানসহ কপি হবে
            const clonedBook = allBooks[i].cloneNode(true); 
            latestGrid.appendChild(clonedBook);
        }
    }


   const searchFilterInput = document.getElementById('book-filter');
    if (searchFilterInput) {
        searchFilterInput.addEventListener('input', filterBooks);
    }

    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            selectedCategory = this.getAttribute('data-cat');
            filterBooks();
        });
    });

    // মোবাইল এবং ডেস্কটপে হোভার বা টাচ করার পর সার্চ ইনপুট বক্সে ফোকাস করার জন্য ছোট টগল
    const searchTrigger = document.getElementById('search-trigger-btn');
    if (searchTrigger) {
        searchTrigger.addEventListener('click', () => {
            const bar = document.getElementById('search-hover-bar');
            if (bar) {
                searchFilterInput.focus();
            }
        });
    }
});