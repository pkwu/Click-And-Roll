function ClickAndRoll(players) {
  this.bodyText = document.body.textContent;
  this.dataReceived = false;
  this.frame = document.createElement('iframe');
  this.frame.id ='click-and-roll-frame';
  this.frameContainer = document.createElement('div');
  this.frameContainer.id = 'click-and-roll-frame-container';
  this.frameContent = document.createElement('div');
  this.frameContent.id = 'frame-content';
  this.namePosition = {};
  this.players = players;
  this.resultSearch = new ResultSearch();

  this.utils = new Utils();

  this.run = () => {
    $.ajax(chrome.extension.getURL('view/frame.html'), {method: 'GET'})
      .then(response => {
        this.statTemplate = response;
        return $.ajax(chrome.extension.getURL('view/frame.css'), {method: 'GET'})
      })
      .then(response => {
        this.frameStyle = response;

        const playerNames = this.players.map((player) => player.name);

        this.resultSearch.setSearchStrings(playerNames);
        const resultNodes = this.resultSearch.searchRootNode(document.body);

        this.highlight(resultNodes);
        this.observeMutations();
      });
  };

  this.highlight = (nodes) => {
    nodes.forEach(node => {
      node.style.color = 'teal';
      node.style.display = 'inline';
      node.onmouseenter = this.handleHover;
    });
  };

  this.observeMutations = () => {

    const observerCallback = (function(mutations) {
      if (this.bodyText !== document.body.textContent) {
        this.bodyText = document.body.textContent;

        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes) {
            mutations[i].addedNodes.forEach(node => {
              if (node.innerText && node.innerText.trim().length >= 4) {
                observer.disconnect();
                const resultNodes = this.resultSearch.searchRootNode(node);
                this.highlight(resultNodes);
                observer.observe(document.body, { childList: true, subtree: true });
              }
            });
          }
        }
      }
    }).bind(this);

    const observer = new MutationObserver(observerCallback);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  this.handleHover = (mouseEnterEvent) => {
    // prevent repeat hovers on current target, restore hover event to previous target
    if (this.currentNameElement) {
      this.currentNameElement.onmouseenter = this.handleHover
    }
    const targetElement = mouseEnterEvent.target;
    targetElement.onmouseenter = null;
    this.currentNameElement = targetElement;

    const name = targetElement.textContent;
    const newPlayerId = this.players.filter(player => player.name === name)[0].id;

    const oldContainerParent = this.frameContainer.parentNode;
    const newContainerParent = this.getContainerParentFromElement(targetElement);

    if (newContainerParent !== oldContainerParent) {
      this.updateContainerParent(oldContainerParent, newContainerParent);
    }

    this.frameContainer.style.height = 'calc(50vh + 2px)';
    this.getFrameDocument().body.innerHTML = '';
    this.positionFrameContainer(targetElement, newContainerParent);
    this.getFrameDocument().body.appendChild(this.frameContent);

    if (newPlayerId !== this.currentPlayerId) {
      this.frameContent.classList.remove('loaded');
      this.frameContent.classList.add('loading');
      this.frameContent.innerHTML = this.statTemplate;
      this.addCloseOverlayListeners();
      this.currentPlayerId = newPlayerId;
      this.dataReceived = false;

      this.utils.fetchRequest({message: 'fetchStats', playerId: this.currentPlayerId})
        .then(stats => {
          // current player id may have been reassigned by a later hover, making these stats out of date
          if (newPlayerId === this.currentPlayerId) {
            this.dataReceived = true;
            this.displayStats(stats, name)
          }
        });
    } else {
      this.addCloseOverlayListeners();
      this.displayStats();
    }
  };

  this.getContainerParentFromElement = (element) => {
    let rootOffsetParent = element;
    let rootScrollParent = null;

    while (rootOffsetParent.offsetParent) {
      rootOffsetParent = rootOffsetParent.offsetParent;
      rootScrollParent = (rootOffsetParent.scrollHeight > rootOffsetParent.clientHeight)
        ? rootOffsetParent
        : rootScrollParent;
    }

    return (rootOffsetParent === document.body)
      ? document.body
      : rootScrollParent || rootOffsetParent;
  };

  this.updateContainerParent = (oldParent, newParent) => {
    if (oldParent) {
      this.frameContainer.parentNode.removeChild(this.frameContainer);
    }

    newParent.appendChild(this.frameContainer);
    this.frameContainer.appendChild(this.frame);

    this.getFrameDocument().body.id = 'frame-body';

    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = this.frameStyle;
    style.title = 'click-and-roll';
    this.getFrameDocument().head.appendChild(style);
  };

  this.positionFrameContainer = (targetElement, containerParent) => {
    const rect = targetElement.getBoundingClientRect();
    this.namePosition.isLeft = rect.left < this.getHalfViewWidth();
    this.namePosition.isTop = rect.top < this.getHalfViewHeight();

    this.frameContainer.style.marginLeft = this.namePosition.isLeft ? '0' : '4px';

    // remove existing animation class
    this.frameContent.classList.remove('reveal-from-top', 'reveal-from-bottom');

    if (this.namePosition.isTop) {
      this.frameContent.classList.add('reveal-from-top');
    } else {
      this.frameContent.classList.add('reveal-from-bottom');
    }

    const offset = this.getOffsetFromParent(rect, containerParent);
    this.frameContainer.style.top = offset.top + 'px';
    this.frameContainer.style.left = offset.left + 'px';
    this.frameContainer.hidden = false;
  };

  this.getOffsetFromParent = (rect, containerParent) => {
    const scrollX = (containerParent === document.body)
      ? (window.scrollX ? window.scrollX : window.pageXOffset)
      : containerParent.scrollLeft;
    const scrollY = (containerParent === document.body)
      ? (window.scrollY ? window.scrollY : window.pageYOffset)
      : containerParent.scrollTop;

    const parentOffset = {
      x: (containerParent === document.body) ? 0 : containerParent.getBoundingClientRect().left,
      y: (containerParent === document.body) ? 0 : containerParent.getBoundingClientRect().top
    };

    // 2 pixel left offset to accommodate box shadow of frame's inner elements
    const overlayLeft = this.namePosition.isLeft
      ? rect.left + scrollX - parentOffset.x - 2
      : rect.left + scrollX - parentOffset.x - 2 - this.getHalfViewWidth() + rect.width + Math.max(this.getHalfViewWidth() - 800, 0);

    const overlayTop = this.namePosition.isTop
      ? rect.top + scrollY - parentOffset.y + rect.height
      : rect.top + scrollY - parentOffset.y - this.getHalfViewHeight();

    return {
      left: overlayLeft,
      top: overlayTop
    }
  };

  this.addCloseOverlayListeners = () => {
    this.getFrameDocument().getElementById('dismiss').onclick = this.closeOverlay;
    document.addEventListener('click', this.closeOverlay);
  };

  this.closeOverlay = () => {
    this.currentNameElement.onmouseenter = this.handleHover;
    this.frameContainer.hidden = true;
    document.removeEventListener('click', this.closeOverlay);
  };

  this.displayStats = (stats, name) => {
    // catches edge case where user hovers on same name in quick succession, ensures loading graphic displays until data arrives
    if (!this.dataReceived) return;

    this.frameContent.classList.remove('loading');
    this.frameContent.classList.add('loaded');

    if (stats) {
      this.getFrameDocument().getElementById('player-name').textContent = name;
      this.mapPlayerProfile(stats.profile, name);
      this.mapStatsToRows(stats.career);
    }

    if (!this.frameContainer.hidden) {
      this.resizeFrameContent();
    }
  };

  this.mapPlayerProfile = (profile, name) => {
    const profileImageElement = this.getFrameDocument().getElementById('player-profile-image');

    fetch(profile.imageUrl, {cache: 'force-cache', redirect: 'error'})
      .then(() => {
        profileImageElement.src = profile.imageUrl;
        profileImageElement.alt = name;
      })
      .catch(err => {
        console.log(err);
      });

    const profileInfoDetails = [
      'team',
      'number',
      'position',
      'birthday',
      'height',
      'weight',
      'country',
      'college',
      'draft'
    ];

    for (let i = 0; i < profileInfoDetails.length; i++) {
      const infoDataElement = this.getFrameDocument().getElementById('info-' + profileInfoDetails[i]);
      infoDataElement.textContent = profile[profileInfoDetails[i]];
    }
  };

  this.mapStatsToRows = (stats) => {
    if (stats.seasons.rowSet.length === 0) {
      this.getFrameDocument().getElementById('content').removeChild(this.getFrameDocument().getElementById('career-heading'));
      this.getFrameDocument().getElementById('content').removeChild(this.getFrameDocument().getElementById('table-container'));
    }

    for (let i = 0; i < stats.seasons.rowSet.length; i++) {
      const season = stats.seasons.rowSet[i];
      const row = this.createRow(season, stats.allStarSeasons.indexOf(season[1]) !== -1, false);
      this.getFrameDocument().getElementById('season-averages-body').appendChild(row);
    }

    if (stats.career.rowSet.length !== 0) {
      const careerRow = this.createRow(stats.career.rowSet[0], false, true);
      careerRow.classList.add('career');
      this.getFrameDocument().getElementById('season-averages-body').appendChild(careerRow);
    }
  };

  this.createRow = (season, isAllStarSeason, isCareerRow) => {
    if (isCareerRow) {
      season[0] = 'Career';
      season[1] = season[2] = '-';
    } else {
      const statsToRemove = [3, 2, 0];
      for (let j = 0; j < statsToRemove.length; j++) {
        season.splice(statsToRemove[j], 1);
      }
    }

    const row = this.getFrameDocument().createElement('tr');

    for (let k = 0; k < season.length; k++) {
      const stat = this.getFrameDocument().createElement('td');
      stat.textContent = (season[k] === null)
        ? 'n/a'
        : season[k];
      if (k === 0) {
        stat.classList.add('season');
        stat.classList.add('stick-left');
        stat.innerHTML += isAllStarSeason
          ? '<span style="color:gold; padding-left: 8px">&#9733;</span>'
          : '';
      }
      row.appendChild(stat)
    }

    return row;
  };

  this.resizeFrameContent = () => {
    const frameContent = this.getFrameDocument().getElementById('content');
    const playerHeaderHeight = 37;

    if (frameContent.scrollHeight + playerHeaderHeight < (this.getHalfViewHeight()) - 2) {
      this.frameContent.classList.remove('reveal-from-top', 'reveal-from-bottom');
      const newHeight = (frameContent.scrollHeight + playerHeaderHeight) + 'px';

      const rule = this.namePosition.isTop
        ? '@keyframes resize{from{height:calc(100vh - 2px);}'
        + 'to{height:' + newHeight + ';}}'
        : '@keyframes resize{from{height:calc(100vh - 2px);margin-top:0;;}'
        + 'to{height:' + newHeight + ';margin-top:calc(100vh - 2px - ' + newHeight + ');}}';

      // if user has scrolled over multiple names in quick succession, existing resize rule and event listeners should be removed
      this.removeResizeAnimation();
      this.frameContent.removeEventListener('animationend', this.handleAnimationEnd);

      this.getStyleSheet().insertRule(rule, 0);
      this.frameContent.addEventListener('animationend', this.handleAnimationEnd);
      this.frameContent.classList.add('resize');
    }
  };

  this.handleAnimationEnd = (animationEvent) => {
    if (animationEvent.animationName === 'resize') {
      this.removeResizeAnimation();
      this.frameContent.classList.remove('resize');
      this.frameContent.removeEventListener('animationend', this.handleAnimationEnd);

      const frameContentHeight = this.frameContent.scrollHeight + 2;
      this.frameContainer.style.height = frameContentHeight + 'px';
      this.frameContainer.style.top = this.namePosition.isTop
        ? this.frameContainer.style.top
        : this.frameContainer.offsetTop + this.getHalfViewHeight() - frameContentHeight + 'px';
    }
  };

  this.removeResizeAnimation = () => {
    const stylesheet = this.getStyleSheet();
    const resizeRules = Array.prototype.filter.call(stylesheet.rules, rule => rule.name === 'resize');
    for (let i = 0; i < resizeRules.length; i++) {
      stylesheet.deleteRule(Array.prototype.indexOf.call(stylesheet.rules, resizeRules[i]));
    }
  };

  this.getHalfViewHeight = () => {
    return window.innerHeight / 2;
  };

  this.getHalfViewWidth = () => {
    return window.innerWidth / 2;
  };

// ensures we always manipulate the correct style sheet if others are injected in iFrame e.g. by another extension
  this.getStyleSheet = () => {
    return Array.prototype.filter.call(this.getFrameDocument().styleSheets, stylesheet => {
      return stylesheet.title === 'click-and-roll';
    })[0];
  };

  this.getFrameDocument = () => {
    return this.frame.contentDocument;
  };

}