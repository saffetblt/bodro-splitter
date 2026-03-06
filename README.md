# Bordro PDF Bölücü

Bu uygulama PDF dosyasını tarayıcıda açar, bordro alanlarını otomatik algılar ve bordroları yeni bir PDF içinde ayrı sayfalar olarak indirir.

## Çalıştırma

1. Proje klasörüne girin.
2. Basit bir HTTP sunucusu başlatın:
   ```bash
   python3 -m http.server 8080
   ```
3. Tarayıcıda açın:
   - http://localhost:8080

## Kullanım

1. `PDF Seç` ile dosyanızı yükleyin (veya sürükleyip bırakın).
2. `Bordroları Otomatik Böl` butonuna basın.
3. Durum alanında yükleme ve bölme adımlarını takip edin.
4. İşlem tamamlanınca `İndir` butonu aktifleşir.
5. Çıktı dosyası, kaynak adına `_bolunmus.pdf` ekiyle indirilir.

## Algılama Mantığı

- Her sayfada metin katmanından `PUSULASI` başlıkları bulunur.
- Her başlık yeni bir bordronun başlangıcı kabul edilir.
- Başlangıçlar arasındaki alanlar kesilerek ayrı PDF sayfaları oluşturulur.
- Başlık bulunamazsa güvenli modda o sayfa tek bordro kabul edilir.

## GitHub Pages Deploy

1. GitHub'da yeni bir repo oluşturun.
2. Bu klasörde git başlatın ve kodu push edin:
   ```bash
   cd /Users/blt/software/bodro_pdf_splitter
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<kullanici-adi>/<repo-adi>.git
   git push -u origin main
   ```
3. GitHub repo ayarlarında `Settings > Pages` altında `Build and deployment` kaynağını `GitHub Actions` yapın.
4. `main` branch'e her push'ta `.github/workflows/deploy-pages.yml` otomatik deploy çalıştırır.
5. Site adresi:
   - `https://<kullanici-adi>.github.io/<repo-adi>/`
