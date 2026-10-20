(() => {

  const pathname =
    location.pathname;

  const onHistory =
    pathname.endsWith(
      "/history.html"
    );



  const onAnalysis =
    pathname.endsWith(
      "/report.html"
    );

  const query =
    new URLSearchParams(
      location.search
    );

  const validModes = [
    "scalping",
    "intraday",
    "swing"
  ];


  const symbol =
    document.getElementById(
      "symbol"
    );

  const exchange =
    document.getElementById(
      "exchange"
    );

  const style =
    document.getElementById(
      "tradingStyle"
    );


  if (
    symbol &&
    query.has("symbol")
  ) {
    symbol.value =
      query.get("symbol");
  }

  if (
    exchange &&
    query.has("exchange")
  ) {
    exchange.value =
      query.get("exchange");
  }

  if (
    style &&
    validModes.includes(
      query.get("mode")
    )
  ) {
    style.value =
      query.get("mode");
  }


  document.body.classList.add(
    "has-site-navigation"
  );


  const nav =
    document.createElement(
      "nav"
    );

  nav.className =
    "site-navigation";

  nav.setAttribute(
    "aria-label",
    "Main navigation"
  );


  const items = [
    [
      "Home",
      "/",
      "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9"
    ],

    [
      "Analysis",
      "/report.html",
      "M5 20V12M12 20V4M19 20V8"
    ],



    [
      "History",
      "/history.html",
      "M4 6h16M4 12h16M4 18h10"
    ],



  ];


  let activeLabel =
    "Home";

  if (onAnalysis) {
    activeLabel =
      "Analysis";
  } else if (onHistory) {
    activeLabel =
      "History";
  }


  const links =
    items.map(
      (
        [
          label,
          href,
          path
        ]
      ) => {

        const link =
          document.createElement(
            "a"
          );

        link.href =
          href;


        const svg =
          document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );

        svg.setAttribute(
          "viewBox",
          "0 0 24 24"
        );

        svg.setAttribute(
          "aria-hidden",
          "true"
        );


        const shape =
          document.createElementNS(
            svg.namespaceURI,
            "path"
          );

        shape.setAttribute(
          "d",
          path
        );

        svg.appendChild(
          shape
        );


        const text =
          document.createElement(
            "span"
          );

        text.textContent =
          label;

        link.append(
          svg,
          text
        );


        if (
          label ===
          activeLabel
        ) {

          link.setAttribute(
            "aria-current",
            "page"
          );

          link.addEventListener(
            "click",
            event => {

              event.preventDefault();

              window.scrollTo({
                top: 0,
                behavior: "smooth"
              });
            }
          );
        }


        nav.appendChild(
          link
        );

        return link;
      }
    );


  function syncLinks() {

    const mode =
      style?.value ||
      query.get("mode") ||
      "swing";

    const selection =
      new URLSearchParams();

    selection.set(
      "mode",
      validModes.includes(
        mode
      )
        ? mode
        : "swing"
    );

    if (symbol) {

      selection.set(
        "symbol",
        symbol.value.trim()
      );
    }

    if (exchange) {

      selection.set(
        "exchange",
        exchange.value.trim()
      );
    }


    links[1].href =
      "/report.html?" +
      selection;


    links[2].href =
      "/history.html";

  }


  [
    symbol,
    exchange,
    style
  ]
    .filter(Boolean)
    .forEach(
      control => {

        control.addEventListener(
          "input",
          syncLinks
        );

        control.addEventListener(
          "change",
          syncLinks
        );
      }
    );


  syncLinks();

  document.body.appendChild(
    nav
  );

})();
