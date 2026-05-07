import { Link } from "react-router";

const updatedAt = "7. maj 2026";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Link
          to="/auth"
          className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <img src="/images/logo.png" alt="Smart ATS" className="h-9 w-9 object-contain" />
          Nazaj na prijavo
        </Link>

        <article className="mt-8 rounded-md border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Zadnja posodobitev: {updatedAt}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pravilnik o zasebnosti</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Ta pravilnik pojasnjuje, kako se v aplikaciji Smart ATS obdelujejo osebni
            podatki uporabnikov in kandidatov. Dokument je namenjen preglednosti glede
            kategorij podatkov, namenov obdelave, pravnih podlag, obdelovalcev, rokov
            hrambe in pravic posameznikov v skladu s Splošno uredbo EU o varstvu
            podatkov (GDPR), Zakonom o varstvu osebnih podatkov (ZVOP-2) in drugimi
            veljavnimi predpisi Republike Slovenije.
          </p>

          <section className="mt-8 space-y-5 text-sm leading-6 text-muted-foreground">
            <div>
              <h2 className="text-base font-semibold text-foreground">1. Upravljavec in vloge pri obdelavi</h2>
              <p>
                Organizacija, ki uporablja Smart ATS za svoje zaposlitvene postopke,
                nastopa kot upravljavec osebnih podatkov kandidatov, ker določa namene
                in sredstva obdelave v konkretnem zaposlitvenem postopku. Smart ATS je
                aplikacijska storitev, ki podatke obdeluje za izvajanje izbranih
                funkcionalnosti. Supabase, Inc. se uporablja kot tehnični ponudnik za
                avtentikacijo, podatkovno bazo, shrambo datotek in strežniške funkcije
                ter za te podatke nastopa kot obdelovalec oziroma podobdelovalec po
                navodilih upravljavca, razen kadar svoje podatke o uporabi storitve
                obdeluje kot samostojni upravljavec v skladu s svojimi pogoji.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">2. Kategorije osebnih podatkov</h2>
              <p>
                Obdelujejo se lahko podatki uporabniškega računa, e-poštni naslov,
                prikazno ime, podatki o delovnih mestih, podatki kandidatov, CV
                datoteke, kontaktni podatki kandidatov, izkušnje, veščine, opombe,
                statusi po fazah, ocene ujemanja, transkripti razgovorov, ponudbeni
                dokumenti, dnevniki aktivnosti in tehnični podatki, ki so potrebni za
                delovanje, zanesljivost in sledljivost aplikacije.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">3. Nameni obdelave</h2>
              <p>
                Podatki se obdelujejo za ustvarjanje in upravljanje uporabniškega računa,
                izvedbo zaposlitvenega postopka, pregled kandidatov, pripravo razgovorov,
                izdelavo transkriptov, pripravo ponudb, vodenje revizijske sledi,
                odpravljanje napak in izpolnjevanje zakonskih ali pogodbenih obveznosti.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">4. Pravne podlage</h2>
              <p>
                Pravne podlage za obdelavo so odvisne od konkretnega postopka in lahko
                vključujejo izvajanje ukrepov pred sklenitvijo pogodbe na zahtevo
                kandidata, zakoniti interes upravljavca za izvedbo in dokumentiranje
                zaposlitvenega postopka, izpolnjevanje zakonskih obveznosti ter
                privolitev, kadar je ta posebej potrebna. Posebne vrste osebnih
                podatkov se ne zbirajo namensko in se smejo obdelovati samo, če za to
                obstaja ustrezna podlaga po GDPR in veljavnem slovenskem pravu.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">5. AI obdelava in transkripcija</h2>
              <p>
                Pri uporabi AI pregleda kandidatov, generiranja ponudb ali transkripcije
                razgovorov se lahko ustrezni deli CV-ja, opisa delovnega mesta, opomb,
                ponudbenih podatkov ali zvočnega posnetka posredujejo ponudniku AI
                obdelave, na primer OpenAI, izključno za izvedbo izbrane funkcije.
                Rezultati AI so pomožni delovni izhod in niso samostojna odločitev o
                zaposlitvi; končno presojo, preverjanje točnosti in odločitev mora vedno
                opraviti pooblaščena oseba.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">6. Obdelovalci in tretji ponudniki</h2>
              <p>
                Podatki se lahko obdelujejo pri ponudnikih, ki omogočajo delovanje
                aplikacije: Supabase za prijavo, podatkovno bazo, hrambo datotek in
                strežniške funkcije; OpenAI za AI analizo, transkripcijo in generiranje
                vsebin, kadar uporabnik sproži te funkcije; ter ponudniki e-poštnih ali
                sistemskih obvestil, kadar so potrebni za prijavo, ponastavitev gesla ali
                obvestila aplikacije. Podatkov kandidatov ne prodajamo, jih ne oddajamo v
                najem in jih ne uporabljamo za vedenjsko oglaševanje.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">7. Države obdelave in prenosi podatkov</h2>
              <p>
                Podatki se primarno hranijo v regiji, izbrani za Supabase projekt. Kadar
                ponudniki ali njihovi podobdelovalci obdelujejo podatke zunaj Evropskega
                gospodarskega prostora, se prenos izvede na podlagi ustreznega mehanizma
                varstva podatkov, kot so standardne pogodbene klavzule, odločba o
                ustreznosti ali drug veljaven instrument po GDPR.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">8. Hramba in izbris</h2>
              <p>
                Podatki uporabniškega računa se hranijo, dokler je račun aktiven oziroma
                dokler so potrebni za delovanje storitve, revizijsko sled ali
                izpolnjevanje obveznosti. Podatki kandidatov, CV-ji, transkripti in
                ponudbeni dokumenti se hranijo toliko časa, kolikor je potrebno za
                zaposlitveni postopek, dokumentiranje odločitev, obrambo pravnih
                zahtevkov ali drugo veljavno pravno podlago. Ko namen obdelave preneha,
                se podatki izbrišejo, anonimizirajo ali arhivirajo skladno z internimi
                kadrovskimi pravili upravljavca.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">9. Pravice posameznikov</h2>
              <p>
                Posamezniki lahko, kadar so izpolnjeni zakonski pogoji, zahtevajo dostop,
                popravek, izbris, omejitev obdelave, prenosljivost podatkov, ugovor
                obdelavi ali preklic privolitve. Kandidati zahteve praviloma naslovijo
                na delodajalca oziroma organizacijo, ki vodi zaposlitveni postopek.
                Uporabniki aplikacije lahko zahteve glede svojega računa naslovijo na
                upravljavca sistema. Posameznik ima pravico vložiti pritožbo pri
                Informacijskem pooblaščencu Republike Slovenije.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">10. Tehnični in organizacijski ukrepi</h2>
              <p>
                Aplikacija uporablja prijavo prek Supabase Auth, omejevanje ustvarjanja
                računov, preverjanje vnosov, nadzor dostopa v uporabniškem vmesniku,
                zasebno hrambo datotek, dnevnike aktivnosti in ločeno strežniško
                obdelavo za občutljive operacije. Dostop do kandidatnih podatkov je
                namenjen pooblaščenim uporabnikom organizacije, ki vodi postopek.
                Upravljavec mora dodatno zagotoviti ustrezna interna pooblastila,
                kadrovske postopke, pravila hrambe in redno preverjanje dostopov.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">11. Spremembe pravilnika</h2>
              <p>
                Pravilnik se lahko posodobi zaradi sprememb aplikacije, ponudnikov,
                pravnih podlag, tehnologije ali zakonodaje. Veljavna različica je
                objavljena v aplikaciji in začne veljati z datumom zadnje posodobitve.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">12. Kontakt</h2>
              <p>
                Za vprašanja glede osebnih podatkov, uveljavljanje pravic ali zahteve
                kandidatov se uporablja uradni kontakt organizacije, ki vodi
                zaposlitveni postopek oziroma upravlja račun Smart ATS. Če je pri
                organizaciji imenovana pooblaščena oseba za varstvo podatkov, se lahko
                zahteva naslovi tudi nanjo.
              </p>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
