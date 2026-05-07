import { Link } from "react-router";

const updatedAt = "7. maj 2026";

export default function Terms() {
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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pogoji uporabe Smart ATS</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Ti pogoji določajo pravila uporabe aplikacije Smart ATS. Z ustvarjanjem
            računa ali uporabo aplikacije potrjujete, da ste pogoje prebrali,
            razumeli in jih sprejemate. Če aplikacijo uporabljate v imenu podjetja,
            potrjujete, da imate pooblastilo za sprejem teh pogojev.
          </p>

          <section className="mt-8 space-y-5 text-sm leading-6 text-muted-foreground">
            <div>
              <h2 className="text-base font-semibold text-foreground">1. Opredelitev storitve</h2>
              <p>
                Smart ATS je programsko orodje za podporo zaposlitvenemu procesu:
                upravljanje delovnih mest, kandidatov, CV-jev, razgovorov,
                transkriptov, aktivnosti in ponudbenih dokumentov. Storitev ne
                nadomešča pravnega, kadrovskega ali strokovnega odločanja uporabnika.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">2. Dovoljena uporaba</h2>
              <p>
                Storitev se sme uporabljati samo za zakonite zaposlitvene in kadrovske
                namene. Prepovedana je uporaba za nezakonito profiliranje,
                diskriminacijo, nadlegovanje, prikrito spremljanje posameznikov,
                nepooblaščeno zbiranje podatkov ali obdelavo podatkov brez ustrezne
                pravne podlage.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">3. Uporabniški račun</h2>
              <p>
                Uporabnik mora zagotoviti točne registracijske podatke, omejiti dostop
                do računa samo pooblaščenim osebam in nemudoma ukrepati ob sumu
                nepooblaščene uporabe. Uporabnik je odgovoren za dejanja, izvedena prek
                njegovega računa, razen če dokaže, da zlorabe ni mogel preprečiti z
                razumnimi ukrepi.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">4. Podatki in vsebina uporabnika</h2>
              <p>
                Uporabnik ostane odgovoren za zakonitost, točnost in ustreznost
                podatkov, ki jih vnese v aplikacijo. Vnašajo naj se samo podatki, ki so
                potrebni za zaposlitveni postopek. Posebne vrste osebnih podatkov se
                smejo obdelovati samo, kadar ima uporabnik za to jasno pravno podlago.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">5. AI funkcije in človeški pregled</h2>
              <p>
                AI povzetki, ocene ujemanja, vprašanja za razgovor, transkripti in
                osnutki ponudb so pomoč pri delu. Ne predstavljajo samodejne odločitve
                o zaposlitvi. Uporabnik mora rezultate preveriti, popraviti in zagotoviti,
                da končne odločitve sprejme pooblaščena oseba.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">6. Tretji ponudniki</h2>
              <p>
                Posamezne funkcije se lahko izvajajo prek zunanjih ponudnikov, na primer
                za gostovanje, hrambo podatkov, avtentikacijo, transkripcijo ali AI
                obdelavo. Uporabnik se strinja, da se podatki lahko posredujejo takim
                ponudnikom v obsegu, ki je potreben za izvedbo zahtevane funkcije.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">7. Omejitve odgovornosti</h2>
              <p>
                Storitev je zagotovljena kot programsko orodje za podporo procesu.
                Upravljavec storitve ne odgovarja za zaposlitvene odločitve, vsebino
                ponudb, zakonitost podatkov, ki jih vnese uporabnik, ali posledice
                odločitev, sprejetih brez ustreznega človeškega pregleda.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">8. Začasna omejitev ali ukinitev dostopa</h2>
              <p>
                Dostop se lahko omeji ali ukine, če uporabnik krši te pogoje, ogroža
                delovanje storitve, poskuša pridobiti nepooblaščen dostop ali uporablja
                storitev za namene, ki niso skladni z zakonodajo ali temi pogoji.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">9. Spremembe pogojev</h2>
              <p>
                Pogoji se lahko posodobijo zaradi sprememb storitve, zakonodaje ali
                načina obdelave podatkov. Ob bistvenih spremembah lahko aplikacija
                zahteva ponovno sprejetje pogojev pred nadaljnjo uporabo.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">10. Veljavno pravo in pristojnost</h2>
              <p>
                Za uporabo storitve v Republiki Sloveniji se ti pogoji razlagajo skladno
                s pravom Republike Slovenije in neposredno veljavnimi predpisi Evropske
                unije. Za spore je pristojno stvarno pristojno sodišče v Republiki
                Sloveniji, razen kadar kogentni predpisi določajo drugače.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">11. Sprejem in veljavnost</h2>
              <p>
                Uporabnik pogoje sprejme ob ustvarjanju računa ali nadaljnji uporabi
                aplikacije po objavi posodobljene različice. Veljavna različica pogojev
                je objavljena v aplikaciji in začne veljati z datumom zadnje
                posodobitve.
              </p>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
