(() => {

  const pathname =
    location.pathname;

  const onChart =
    pathname.endsWith(
      "/workspace.html"
    );

  const onHistory =
    pathname.endsWith(
      "/history.html"
    );

  const onCalculator =
    pathname.endsWith(
      "/calculator.html"
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
      onChart
        ? "symbolInput"
        : "symbol"
    );

  const exchange =
    document.getElementById(
      onChart
        ? "exchangeInput"
        : "exchange"
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
      "Calculator",
      "/calculator.html",
      "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"
    ],

    [
      "History",
      "/history.html",
      "M4 6h16M4 12h16M4 18h10"
    ],

    [
      "Chart",
      "/workspace.html",
      "M3 3v18h18M6 15l4-5 4 3 6-7"
    ],


  ];


  let activeLabel =
    "Home";

  if (onAnalysis) {
    activeLabel =
      "Analysis";
  } else if (onCalculator) {
    activeLabel =
      "Calculator";
  } else if (onHistory) {
    activeLabel =
      "History";
  } else if (onChart) {
    activeLabel =
      "Chart";
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
      onChart
        ? query.get("mode") ||
          "intraday"
        : style?.value ||
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
      "/calculator.html";

    links[3].href =
      "/history.html";

    links[4].href =
      "/workspace.html?" +
      selection;
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


  /*
   * Chart navigation remains hidden
   * in the current mobile UI.
   */
  links[4].hidden =
    true;

  links[4].style.display =
    "none";

})();
