/* =====================================================================
   KONFIGURASI PEMILIHAN KADEP DTGD
   Cukup ubah file ini — tidak perlu menyentuh main.js.
   ===================================================================== */
window.APP_CONFIG = {
  /* URL Web App dari Google Apps Script (lihat apps-script/Code.gs & README.md).
     Biarkan kosong ("") untuk MODE DEMO: data disimpan di browser ini saja,
     password admin demo = "admin". */
  API_URL: "https://script.google.com/macros/s/AKfycbyzDnX-bvxDxLRz49zvoaqEMuVDPmrdZFUssEKqJm7HytamnzxhK5UY9c26RGyXzbpYxg/exec",

  /* Folder foto dosen (relatif terhadap index.html). */
  MEDIA_DIR: "media/",

  /* Interval pembaruan otomatis (milidetik). */
  REFRESH_VOTER_MS: 10000,
  REFRESH_ADMIN_MS: 5000,

  /* Daftar dosen yang eligible.
     - id    : unik, huruf kecil tanpa spasi (dipakai di spreadsheet). Jangan diubah setelah pemilihan dimulai.
     - name  : nama lengkap dengan gelar (tampil di kartu).
     - short : nama tanpa gelar (dipakai untuk inisial bila foto tidak ada).
     - photo : nama file di folder media/ (jpg/png/webp). Rasio 4:5 (potret) paling rapi.
     - jabatan (opsional): "sekdep" | "kaprodi-s1" | "sekprodi-s1" | "kaprodi-s2s3" | "koord-kbk"
       Dipakai untuk mengisi otomatis jabatan saat penetapan (tahap opsional A–D). */
  CANDIDATES: [
    { id: "harintaka",  name: "Prof. Dr. Ir. Harintaka, S.T., M.T., IPU., ASEAN Eng.", short: "Harintaka", photo: "harintaka.jpg" },
    { id: "nurrohmat",  name: "Prof. Ir. Nurrohmat Widjajanti, M.T., Ph.D., IPU., ASEAN Eng., APEC Eng.", short: "Nurrohmat Widjajanti", photo: "nurrohmat.png" },
    { id: "dwilestari", name: "Dr. Ir. Dwi Lestari, S.T., M.E., IPM.", short: "Dwi Lestari", photo: "dwilestari.jpg" },
    { id: "madeandi",   name: "Ir. I Made Andi Arsana, S.T., M.E., Ph.D.", short: "I Made Andi Arsana", photo: "madeandi.png" },
    { id: "diyono",     name: "Dr. Ir. Diyono, S.T., M.T., IPU.", short: "Diyono", photo: "diyono.jpg" },
    { id: "catur",      name: "Dr. Ir. Catur Aries Rokhmana, S.T., M.T., IPU.", short: "Catur Aries Rokhmana", photo: "catur.png" },
    { id: "yulaikhah",  name: "Dr. Ir. Yulaikhah, S.T., M.T., IPU.", short: "Yulaikhah", photo: "yulaikhah.jpg" },
    { id: "bilal",      name: "Dr. Ir. Bilal Ma'ruf, S.T., M.T.", short: "Bilal Ma'ruf", photo: "bilal.jpg" },
    { id: "ruli",       name: "Ir. Ruli Andaru, S.T., M.Eng., Ph.D.", short: "Ruli Andaru", photo: "ruli.jpg" },
    { id: "bambang",    name: "Dr. Ir. Bambang Kun Cahyono, S.T., M.Sc., IPU.", short: "Bambang Kun Cahyono", photo: "bambang.jpg" },
    { id: "basith",     name: "Ir. Abdul Basith, S.T., M.Si., Ph.D.", short: "Abdul Basith", photo: "basith.jpg" },
    { id: "purnama",    name: "Dr.Eng. Ir. Purnama Budi Santosa, S.T., M.App.Sc., IPU.", short: "Purnama Budi Santosa", photo: "purnama.jpg" },
    { id: "heri",       name: "Ir. Heri Sutanta, S.T., M.Sc., Ph.D.", short: "Heri Sutanta", photo: "heri.jpg" },
    { id: "cecep",      name: "Cecep Pratama, S.Si., M.Si., D.Sc.", short: "Cecep Pratama", photo: "cecep.jpeg" }
  ]
};
