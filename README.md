# Bordro PDF Bolucu

Bu uygulama PDF dosyasini tarayicida acar, bordro alanlarini otomatik algilar ve bordrolari yeni bir PDF icinde ayri sayfalar olarak indirir.

## Calistirma

1. Proje klasorune girin.
2. Basit bir HTTP sunucusu baslatin:
   ```bash
   python3 -m http.server 8080
   ```
3. Tarayicida acin:
   - http://localhost:8080

## Kullanim

1. `PDF dosyasi` alanindan bir PDF yukleyin.
2. Sistem, `UCRET PUSULASI` basliklarina gore bordro alanlarini otomatik algilar.
3. Onizlemedeki mavi kutulari kontrol edin.
4. `Otomatik bol ve indir` butonuna basin.
5. Uretilen dosya, kaynak adina `_bolunmus.pdf` ekiyle indirilir.

## Algilama Mantigi

- Her sayfada metin katmanindan `UCRET PUSULASI` basliklari bulunur.
- Her baslik yeni bir bordronun baslangici kabul edilir.
- Baslangiclar arasindaki alanlar kesilerek ayri PDF sayfalari olusturulur.
- Baslik bulunamazsa guvenli modda o sayfa tek bordro kabul edilir.

## GitHub Pages Deploy

1. GitHub'da yeni bir repo olusturun.
2. Bu klasorde git baslatin ve kodu push edin:
   ```bash
   cd /Users/blt/software/bodro_pdf_splitter
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<kullanici-adi>/<repo-adi>.git
   git push -u origin main
   ```
3. GitHub repo ayarlarinda `Settings > Pages` altinda `Build and deployment` kaynagini `GitHub Actions` yapin.
4. `main` branch'e her push'ta `.github/workflows/deploy-pages.yml` otomatik deploy calistirir.
5. Site adresi:
   - `https://<kullanici-adi>.github.io/<repo-adi>/`
