# M1-r2 — Jev-Orchestrated 1B Experts

Tek pilot tamamlandı; IR oluşmadı. Sonuçlar SUMMARY.md ve RESULTS.json içinde. Ham worker/coordinator kararları evidence.zip içinde korunur.

M1 compiler, Typed IR, public candidate grammar ve M0.2 verifier değiştirilmeden kullanılır. Yeni decisions adapter'ı yalnızca bağımsız Entity/Field ve Relationship/Constraint/Operation ready gruplarını açar. Jev scheduling metadata'sıyla ready role seçer; 1B worker tek enum sorusunu cevaplar. IR değerleri yalnızca worker'dan gelir. Beş adaptör unit testi uygulama acceptance sayısına dahil değildir.

Komutlar:

```sh
cd /Users/berdincozer/Desktop/mesh/micro-swarm/m1-r2
npm test
npm run freeze
npm run run
```

Freeze ve gerçek run zaten tamamlandı; mevcut sonuç dosyası ikinci run'ı engeller. API key'ler üst yerel .env'den okunur. OpenRouter cap $0.05, Cloudflare Free günlük ortak rezervasyon cap 5000 Neuron; global iki repair. Docker veya yeni compiler yoktur. Önceki bütün kaynak/sonuçlar değişmez.
