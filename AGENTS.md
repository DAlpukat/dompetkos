# Jangan ubah git author
Semua commit harus pakai git config repo (DAlpukat <justdgoo@gmail.com>). Jangan pakai --author lain dan jangan tambahkan Co-Authored-By / Signed-off-by / trailer lain.

# RTK
RTK yang dimaksud adalah Rust Token Killer (CLI `rtk`), bukan Redux Toolkit atau library lain.
Selalu aktifkan RTK di setiap sesi (plugin `C:\Users\ASUS\.config\opencode\plugins\rtk.ts` auto rewrite via `rtk rewrite`). Pastikan `rtk` di PATH.

# Ponytail
Selalu aktifkan ponytail mode level full di setiap sesi. Ikuti ladder: YAGNI → reuse → stdlib → native → dep terpasang → one-liner → minimal. Tanpa abstraksi spekulatif, diff paling pendek, hapus > tambah.

# Gaya bahasa - Caveman
Selalu aktifkan caveman mode level full di setiap sesi (hemat token ~65%, tetap akurat teknis). Ikuti `C:\Users\ASUS\.config\opencode\skills\caveman\SKILL.md`. Default full, matikan hanya jika user bilang "stop caveman" / "normal mode".

# Workflow Selesai Fitur
Setiap selesai kerjain fitur wajib jalankan urutan ini tanpa dilewat:
1. `rtk rewrite` (pastikan style ponytail + caveman terjaga)
2. Commit profesional — conventional commits (`feat:`, `fix:`, `chore:`), pesan jelas berbahasa Indonesia campur English teknis, tanpa `--author` lain dan tanpa trailer `Co-Authored-By`/`Signed-off-by` (pakai git config repo `DAlpukat <justdgoo@gmail.com>`)
3. `git push origin main` (pastikan `git status` bersih sebelum & sesudah push)
4. Deploy Firebase Hosting: `npx firebase-tools deploy --only hosting --project dompetkos-b5877` (atau `firebase deploy --only hosting` jika CLI terpasang global); verifikasi `Hosting URL: https://dompetkos-b5877.web.app` berhasil
