/**
 * Warstwa interakcji motywu Detektyw.
 *
 * Zasady:
 * - bez zależności i bez kroku budowania,
 * - wszystko jest ulepszeniem progresywnym: bez tego pliku strona działa
 *   i jest w pełni czytelna,
 * - honorujemy prefers-reduced-motion, a celownik nie włącza się na
 *   urządzeniach dotykowych.
 */
( function () {
	'use strict';

	var reduced = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	var finePointer = window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches;

	/* ---------------------------------------------------------------------
	 * Nagłówek: stan po przewinięciu
	 * ------------------------------------------------------------------ */
	function stickyHeader() {
		var progi = 24;
		var ostatni = null;

		function onScroll() {
			var stan = window.scrollY > progi;

			if ( stan !== ostatni ) {
				document.body.classList.toggle( 'is-scrolled', stan );
				ostatni = stan;
			}
		}

		window.addEventListener( 'scroll', onScroll, { passive: true } );
		onScroll();
	}

	/* ---------------------------------------------------------------------
	 * Pojawianie się treści przy przewijaniu
	 *
	 * Animujemy bezpośrednie dzieci sekcji, kaskadą. Elementy widoczne już
	 * przy wczytaniu strony pomijamy — inaczej pierwszy ekran mrugałby.
	 * ------------------------------------------------------------------ */
	function revealOnScroll() {
		if ( reduced || ! ( 'IntersectionObserver' in window ) ) {
			return;
		}

		var tresc = document.querySelector( '.entry-content, .wp-block-query' );

		if ( ! tresc ) {
			return;
		}

		var sekcje = tresc.querySelectorAll(
			':scope > .wp-block-group, :scope > .wp-block-columns, :scope > .wp-block-query'
		);
		var wysokoscEkranu = window.innerHeight;
		var doObserwacji = [];

		sekcje.forEach( function ( sekcja ) {
			if ( sekcja.classList.contains( 'detektyw-hero' ) ) {
				return;
			}

			var wnetrze = sekcja.querySelector( ':scope > .wp-block-group' ) || sekcja;
			var dzieci = Array.prototype.filter.call( wnetrze.children, function ( el ) {
				return el.nodeType === 1 && ! el.classList.contains( 'wp-block-spacer' );
			} );

			// Sekcja z jednym dzieckiem animuje się jako całość.
			var cele = dzieci.length > 1 ? dzieci : [ sekcja ];

			cele.forEach( function ( el, i ) {
				if ( el.getBoundingClientRect().top < wysokoscEkranu * 0.9 ) {
					return;
				}

				el.classList.add( 'detektyw-reveal' );
				el.style.setProperty( '--detektyw-delay', Math.min( i, 6 ) * 70 + 'ms' );
				doObserwacji.push( el );
			} );
		} );

		if ( ! doObserwacji.length ) {
			return;
		}

		var obserwator = new IntersectionObserver(
			function ( wpisy ) {
				wpisy.forEach( function ( wpis ) {
					if ( wpis.isIntersecting ) {
						wpis.target.classList.add( 'is-visible' );
						obserwator.unobserve( wpis.target );
					}
				} );
			},
			{ rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
		);

		doObserwacji.forEach( function ( el ) {
			obserwator.observe( el );
		} );

		/*
		 * Bezpiecznik. Gdyby obserwator z jakiegokolwiek powodu nie zaraportował
		 * przecięcia — a zdarza się to np. w oknach renderowanych w tle — treść
		 * zostałaby z opacity: 0, czyli niewidoczna. Po 2,5 s sprawdzamy, czy
		 * cokolwiek się pokazało; jeśli nie, odsłaniamy wszystko i rezygnujemy
		 * z animacji. Widoczna treść jest ważniejsza niż efekt.
		 */
		window.setTimeout( function () {
			var pokazane = document.querySelectorAll( '.detektyw-reveal.is-visible' ).length;

			if ( pokazane > 0 ) {
				return;
			}

			doObserwacji.forEach( function ( el ) {
				obserwator.unobserve( el );
				el.classList.remove( 'detektyw-reveal' );
			} );
		}, 2500 );
	}

	/* ---------------------------------------------------------------------
	 * Celownik pod kursorem
	 *
	 * Domyślnie mała ramka kadrowania podążająca za kursorem. Nad elementem
	 * interaktywnym zatrzaskuje się na jego prostokącie i działa jak ruchomy
	 * obrys — to ten sam mechanizm dla menu, przycisków i kafli.
	 * ------------------------------------------------------------------ */
	function reticle() {
		if ( reduced || ! finePointer ) {
			return;
		}

		var el = document.createElement( 'div' );
		el.className = 'detektyw-reticle';
		el.setAttribute( 'aria-hidden', 'true' );

		for ( var i = 0; i < 4; i++ ) {
			el.appendChild( document.createElement( 'span' ) );
		}

		document.body.appendChild( el );

		var cel = { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 44, h: 44 };
		var teraz = { x: cel.x, y: cel.y };
		var zablokowany = null;
		var widoczny = false;

		var SELEKTOR =
			'a[href], button, summary, input:not([type="hidden"]), textarea, select, ' +
			'[role="button"], .wp-block-group[class*="is-layout-grid"] > .wp-block-group';

		function ustawCel( event ) {
			if ( ! widoczny ) {
				el.classList.add( 'is-active' );
				widoczny = true;
			}

			var interaktywny = event.target.closest ? event.target.closest( SELEKTOR ) : null;

			if ( interaktywny ) {
				var r = interaktywny.getBoundingClientRect();

				// Bardzo duże obszary pomijamy — obrys wokół całej sekcji nic nie wnosi.
				if ( r.width < window.innerWidth * 0.9 && r.height < 340 ) {
					zablokowany = interaktywny;
					cel.x = r.left + r.width / 2;
					cel.y = r.top + r.height / 2;
					cel.w = Math.round( r.width + 14 );
					cel.h = Math.round( r.height + 12 );
					el.classList.add( 'is-locked' );
					return;
				}
			}

			zablokowany = null;
			el.classList.remove( 'is-locked' );
			cel.x = event.clientX;
			cel.y = event.clientY;
			cel.w = 44;
			cel.h = 44;
		}

		function petla() {
			var wspolczynnik = zablokowany ? 0.28 : 0.18;
			teraz.x += ( cel.x - teraz.x ) * wspolczynnik;
			teraz.y += ( cel.y - teraz.y ) * wspolczynnik;

			el.style.width = cel.w + 'px';
			el.style.height = cel.h + 'px';
			el.style.transform =
				'translate3d(' +
				Math.round( teraz.x - cel.w / 2 ) +
				'px,' +
				Math.round( teraz.y - cel.h / 2 ) +
				'px,0)';

			requestAnimationFrame( petla );
		}

		document.addEventListener( 'pointermove', ustawCel, { passive: true } );
		document.addEventListener( 'pointerdown', ustawCel, { passive: true } );

		document.addEventListener( 'pointerleave', function () {
			el.classList.remove( 'is-active' );
			widoczny = false;
		} );

		// Przy przewijaniu zablokowany prostokąt trzeba przeliczyć.
		window.addEventListener(
			'scroll',
			function () {
				if ( ! zablokowany ) {
					return;
				}

				var r = zablokowany.getBoundingClientRect();
				cel.x = r.left + r.width / 2;
				cel.y = r.top + r.height / 2;
			},
			{ passive: true }
		);

		requestAnimationFrame( petla );
	}

	/* ---------------------------------------------------------------------
	 * Formularz: licznik znaków i stan wysyłki
	 * ------------------------------------------------------------------ */
	function formularz() {
		var form = document.querySelector( '.detektyw-form' );

		if ( ! form ) {
			return;
		}

		var pole = form.querySelector( 'textarea[name="detektyw_sprawa"]' );

		if ( pole ) {
			var minimum = parseInt( pole.getAttribute( 'minlength' ), 10 ) || 20;
			var licznik = document.createElement( 'span' );
			licznik.className = 'detektyw-form__count';
			licznik.setAttribute( 'aria-live', 'polite' );
			pole.insertAdjacentElement( 'afterend', licznik );

			var odswiez = function () {
				var brakuje = minimum - pole.value.trim().length;

				if ( brakuje > 0 ) {
					licznik.textContent = 'jeszcze ' + brakuje + ' zn.';
					licznik.classList.remove( 'is-ok' );
				} else {
					licznik.textContent = 'opis wystarczający';
					licznik.classList.add( 'is-ok' );
				}
			};

			pole.addEventListener( 'input', odswiez );
			odswiez();
		}

		form.addEventListener( 'submit', function () {
			form.classList.add( 'is-sending' );
			var przycisk = form.querySelector( 'button[type="submit"]' );

			if ( przycisk ) {
				przycisk.textContent = 'Wysyłanie…';
			}
		} );
	}


	/* ---------------------------------------------------------------------
	 * Ułatwienia dostępu: wysoki kontrast i powiększenie tekstu
	 *
	 * Panel powstaje w JS, bo bez skryptu przyciski nic by nie robiły.
	 * Wybór zapisujemy w localStorage, więc utrzymuje się między stronami.
	 * Skala działa na font-size korzenia dokumentu — cały układ jest oparty
	 * na rem i clamp, więc powiększa się proporcjonalnie, bez rozjeżdżania.
	 * ------------------------------------------------------------------ */
	function ulatwienia() {
		var KLUCZ_SKALA = 'detektyw-skala';
		var KLUCZ_KONTRAST = 'detektyw-kontrast';
		var SKALE = [ 1, 1.15, 1.3 ];
		var html = document.documentElement;

		function czytaj( klucz, domyslna ) {
			try {
				var v = window.localStorage.getItem( klucz );
				return null === v ? domyslna : v;
			} catch ( e ) {
				return domyslna;
			}
		}

		function zapisz( klucz, wartosc ) {
			try {
				window.localStorage.setItem( klucz, wartosc );
			} catch ( e ) {}
		}

		var poziom = parseInt( czytaj( KLUCZ_SKALA, '0' ), 10 ) || 0;
		var kontrast = '1' === czytaj( KLUCZ_KONTRAST, '0' );

		function zastosuj() {
			html.style.setProperty( '--detektyw-skala', String( SKALE[ poziom ] ) );
			html.toggleAttribute( 'data-kontrast', kontrast );
		}

		var panel = document.createElement( 'div' );
		panel.className = 'detektyw-a11y';
		panel.setAttribute( 'role', 'group' );
		panel.setAttribute( 'aria-label', 'Ułatwienia dostępu' );

		function przycisk( etykieta, tytul, klik ) {
			var b = document.createElement( 'button' );
			b.type = 'button';
			b.innerHTML = etykieta;
			b.setAttribute( 'aria-label', tytul );
			b.title = tytul;
			b.addEventListener( 'click', klik );
			panel.appendChild( b );
			return b;
		}

		var status = document.createElement( 'span' );
		status.className = 'screen-reader-text';
		status.setAttribute( 'aria-live', 'polite' );

		function komunikat( tekst ) {
			status.textContent = tekst;
		}

		przycisk( 'A<sup>+</sup>', 'Powiększ tekst', function () {
			poziom = Math.min( poziom + 1, SKALE.length - 1 );
			zapisz( KLUCZ_SKALA, String( poziom ) );
			zastosuj();
			komunikat( 'Rozmiar tekstu: ' + Math.round( SKALE[ poziom ] * 100 ) + ' procent' );
		} );

		przycisk( 'A<sup>&minus;</sup>', 'Zmniejsz tekst', function () {
			poziom = Math.max( poziom - 1, 0 );
			zapisz( KLUCZ_SKALA, String( poziom ) );
			zastosuj();
			komunikat( 'Rozmiar tekstu: ' + Math.round( SKALE[ poziom ] * 100 ) + ' procent' );
		} );

		var bKontrast = przycisk( '◐', 'Wysoki kontrast', function () {
			kontrast = ! kontrast;
			zapisz( KLUCZ_KONTRAST, kontrast ? '1' : '0' );
			zastosuj();
			bKontrast.setAttribute( 'aria-pressed', kontrast ? 'true' : 'false' );
			komunikat( kontrast ? 'Wysoki kontrast włączony' : 'Wysoki kontrast wyłączony' );
		} );
		bKontrast.setAttribute( 'aria-pressed', kontrast ? 'true' : 'false' );

		panel.appendChild( status );
		document.body.appendChild( panel );
		zastosuj();
	}

	/* ---------------------------------------------------------------------
	 * Informacja o plikach cookies
	 *
	 * Serwis w tej konfiguracji nie ustawia plików cookies wymagających zgody:
	 * nie ma analityki, osadzonej mapy ani fontów z zewnętrznej domeny.
	 * Dlatego jest to komunikat informacyjny, a nie bramka zgody — bramka
	 * sugerowałaby zgodę na coś, czego nie ma. Po dodaniu analityki trzeba
	 * będzie zastąpić to mechanizmem realnej zgody.
	 * ------------------------------------------------------------------ */
	function ciasteczka() {
		var KLUCZ = 'detektyw-cookies';

		try {
			if ( '1' === window.localStorage.getItem( KLUCZ ) ) {
				return;
			}
		} catch ( e ) {
			return;
		}

		var box = document.createElement( 'aside' );
		box.className = 'detektyw-cookies';
		box.setAttribute( 'aria-label', 'Informacja o plikach cookies' );
		box.innerHTML =
			'<p>Nie używamy analityki ani zewnętrznych osadzeń, więc serwis nie ustawia ' +
			'plików cookies wymagających zgody. Zapamiętujemy jedynie ustawienia ' +
			'dostępności w pamięci przeglądarki. ' +
			'<a href="/polityka-cookies/">Polityka cookies</a></p>';

		var ok = document.createElement( 'button' );
		ok.type = 'button';
		ok.className = 'wp-element-button';
		ok.textContent = 'Rozumiem';
		ok.addEventListener( 'click', function () {
			try {
				window.localStorage.setItem( KLUCZ, '1' );
			} catch ( e ) {}
			box.remove();
		} );

		box.appendChild( ok );

		/*
		 * Komunikat pojawia się wyłącznie po zejściu z pierwszego ekranu.
		 * Świadomie nie ma zapasowego pokazywania po czasie: leżał wtedy
		 * na przycisku „Zadzwoń”, czyli na najważniejszym elemencie strony.
		 * Treść jest informacyjna, a polityka cookies jest w stopce, więc
		 * nikt niczego nie traci, jeśli nie przewinie.
		 */
		var pokazany = false;

		function pokaz() {
			if ( pokazany ) {
				return;
			}

			pokazany = true;
			document.body.appendChild( box );
			window.removeEventListener( 'scroll', naScroll );
		}

		function naScroll() {
			if ( window.scrollY > window.innerHeight * 0.75 ) {
				pokaz();
			}
		}

		window.addEventListener( 'scroll', naScroll, { passive: true } );
	}

	function start() {
		stickyHeader();
		revealOnScroll();
		reticle();
		formularz();
		ulatwienia();
		ciasteczka();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
} )();
