export const examples = {
  hello: { file: 'merhaba.kivil', code: `# Her büyük fikir küçük bir merhaba ile başlar.
isim = "Dünya"
yaz("Merhaba", isim)

# Değişkenlerle biraz oynayalım.
puan = 10
bonus = 20
toplam = puan + bonus * 3

yaz("Bugünkü puanın:", toplam)
yaz("İlk kıvılcım senden!")` },
  conditions: { file: 'kosullar.kivil', code: `# Koşullar parantez içinde, bloklar süslü parantezle.
puan = 75

eger (puan >= 85) {
    yaz("Harika iş!")
} degilse eger (puan >= 50) {
    yaz("Geçtin. Devam et!")
} degilse {
    yaz("Bir kez daha deneyelim.")
}

sayac = 0
iken sayac < 3 {
    yaz("Adım:", sayac + 1)
    sayac = sayac + 1
}` },
  lists: { file: 'listeler.kivil', code: `# Birkaç fikri aynı listede topla.
sayilar = [10, 20, 30]
sayilar[1] = 25
sayilar.ekle(40)

yaz("Listem:", sayilar)
yaz("Kaç eleman?", sayilar.uzunluk())

indeks = 0
toplam = 0
iken indeks < sayilar.uzunluk() {
    toplam = toplam + sayilar[indeks]
    indeks = indeks + 1
}
yaz("Toplam:", toplam)` },
  functions: { file: 'islevler.kivil', code: `# Bir fikre isim ver, tekrar tekrar kullan.
islev kare(n) {
    dondur n * n
}

yaz("7'nin karesi:", kare(7))

islev faktoriyel(n) {
    eger (n <= 1) {
        dondur 1
    }
    dondur n * faktoriyel(n - 1)
}
yaz("6 faktöriyel:", faktoriyel(6))` },
  input: { file: 'girdi.kivil', code: `# Çalıştırınca sağdaki alana yanıtını yaz.
isim = girdi("Adın ne? ")
yaz("Merhaba", isim)

yas = sayi(girdi("Kaç yaşındasın? "))
yaz("Gelecek yıl", yas + 1, "yaşında olacaksın.")

eger (yas >= 18) {
    yaz("Kendi yolunu çizmeye hazırsın.")
} degilse {
    yaz("Merak etmek için yaş sınırı yok!")
}` },
};
