# M0 — Can Small Models Cooperate?

Durum: ilk gerçek development ölçümü tamamlandı, negatif sonuç. Hipotez kanıtlanmadı. 20 gerçek holdout kullanıcı kararıyla çalıştırılmadı.

4 Kasım 2026: Kullanıcı ilk ölçüm görevini stok ve rezervasyon API'si olarak seçti. Önceki Task API başlangıç hedefinin yerini aldı. Docker kullanılmayacak (disk kısıtı).

## Karar kuralları

- M0 tamamlandı: dondurulmuş sözleşmeyle gerçek A/B/C koşumları, bağımsız HTTP/SQLite testleri, tüm ham çıktılar ve dürüst sonuç raporu mevcut.
- Bu, tez doğrulandı demek değildir. Tek görev yalnızca smoke ölçümüdür.
- Mock, replay, elle yazılmış altın referans ve statik kontroller model başarısı sayılmaz.
- Geçersiz JSON, model hatası, provider hatası ve çalıştırılamayan koşumlar ayrı kaydedilir. Hiçbir koşum rapordan seçilerek çıkarılmaz.
- Sonuç görüldükten sonra sözleşme, test, eşik veya prompt sessizce değiştirilemez. Değişiklik yeni deney sürümü gerektirir.
- İlk 20 holdout senaryosu aynı stok/rezervasyon ailesindeki parametrik varyasyonlardır. 20 bağımsız yazılım alanı gibi sunulamaz.
- K1: C en az 4/20. K2: C başarı oranı A'nın en az iki katı; A=0 ise oran tanımsızdır. A2 onarım kontrolü ve B karşılaştırması ayrıca raporlanır.
- Olumlu 20 senaryo sonucu kesin kanıt sayılmaz. Önceden görülmemiş, daha geniş görevlerle doğrulama gerekir.
- Eşikler sağlanmazsa sonuç başarısız veya yetersizdir; daha güçlü modele geçerek aynı deney başarılı gösterilemez.
- p95 hedefi 120 saniyedir; sağlanmazsa gerçek süre açıklanır.

Başarısızlık, araştırmanın korunacak çıktısıdır. Kullanıcının heyecanı karar ölçütlerini değiştirmez.

## Gözlenen M0 sonucu

A: 1, A2: 4, B: 4, C: 3 inference çağrısı. Toplam 12/12 yanıt JSON protokolünü bozdu. Çalışan uygulama yok; koordinasyon kazancı gösterilemedi. Ayrıntılar ../RESULTS.md ve ../results/M0-evidence.json içinde.

## M0.1 — Protocol Independence

Kullanıcı 4 Kasım 2026'da ayrı bir deney istedi: engine dosya yolunu seçer, model yalnızca kaynak üretir; deterministik extractor kullanılır. En az 20 bağımsız çağrıdan 18'inde insan müdahalesi olmadan kullanılabilir dosya çıktısı kapısı. Sözdizimi/protokol başarısı uygulama doğruluğu sayılmaz. Kapı geçilirse ana A/A2/B/C görevine dönülür. M0 kayıtları ve dondurulmuş kaynakları değiştirilmeden sürüm m01/ altında tutulur.

M0.1 sonuç: protokol 20/20 (%100) — kapı geçti; ham kod 0/20, extractor 20/20. A/A2/B HTTP testlerine ulaştı, C schema hatasında kaldı. Tam uygulama başarısı 0/4; koordinasyon tezi kanıtlanmadı. Kanıtlar ../m01/RESULTS.md ve ../m01/results/ altında.
