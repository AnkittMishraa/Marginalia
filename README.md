# Marginalia

A local-first ebook and audiobook PWA. No account or paid service is required.

## Update an existing GitHub Pages install
1. Download and extract this ZIP on your phone.
2. Upload/replace the project files in the root of your existing `Marginalia` GitHub repository. Keep the `icons` assets and all files together.
3. Commit the changes and wait for GitHub Pages to publish.
4. Open Marginalia, open Settings, and use **Export backup** before making other changes.

This release keeps the existing IndexedDB database name and version, so it is designed to preserve the current library. Do not clear browser/site data while updating.

## Backup and restore
- **Export backup** downloads one `.json` file containing imported book/audio bytes, book metadata, custom covers, reading/listening positions, bookmarks and settings.
- Store that file somewhere safe. It may be large because it contains the actual media files.
- **Restore backup** merges into the current library. Existing books are retained and duplicates are skipped; it does not intentionally delete books. Settings are merged and existing setting values take priority, while bookmark lists are combined.
- Keep the backup file private: it contains copies of your books and library data.

Supported imports: EPUB, PDF, TXT, MP3, M4A, AAC, OGG and WAV. Browser support for particular audio formats can vary.
