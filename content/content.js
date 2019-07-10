const searchTextContent = (rootNode, playerNames) => {
  const nodeText = rootNode.textContent;
  const ac = new AhoCorasick(playerNames);
  return ac.search(nodeText);
};

const getNextResult = (results) => {
  const rawResult = results.shift();

  if (rawResult !== undefined) {
    return {
      index: rawResult[0],
      name: rawResult[1][0]
    }
  }

  return undefined;
};

const locateAndFormatResults = (rootNode, results) => {
  const treeWalker = document.createTreeWalker(rootNode, 4);
  let currentTextIndex = 0;
  let nextResult = getNextResult(results);

  while (nextResult !== undefined) {
    // traverse node tree and locate text node containing next result
    const currentNode = treeWalker.currentNode.nodeName === '#text'
                          ? treeWalker.currentNode
                          : treeWalker.nextNode();
    const nodeTextLength = currentNode.textContent.length;
    const nodeIncludesNextResult = currentTextIndex + nodeTextLength >= nextResult.index;

    if (nodeIncludesNextResult) {
      // do not reformat text nodes within script and style elements, these are not displayed to the user
      const parentNodeName = currentNode.parentNode.nodeName;
      const parentNodeIsValid = parentNodeName !== 'SCRIPT' && parentNodeName !== 'STYLE';

      if (parentNodeIsValid) {
        highlightResult(nextResult, currentNode, currentTextIndex);
      }

      nextResult = getNextResult(results);

    } else {
      currentTextIndex += nodeTextLength;
      treeWalker.nextNode();
    }
  }
};

const highlightResult = (result, node, currentTextIndex) => {
  const resultEndOffset = result.index - currentTextIndex + 1;
  const resultStartOffset = resultEndOffset - result.name.length;

  if (resultStartOffset < 0) {
    // match is probably split into two nodes with text formatting on surname i.e. LeBron <b>James</b>
    return;
  }

  const range = document.createRange();
  range.setStart(node, resultStartOffset);
  range.setEnd(node, resultEndOffset);

  const wrapper = document.createElement('span');
  wrapper.setAttribute(
    'style',
    'background-color: yellow; display: inline;'
  );
  range.surroundContents(wrapper);
};

const observeMutations = (playerNames) => {
  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const addedNodes = mutations[i].addedNodes;
      if (addedNodes.length > 0) {
        const mutationRootNode = addedNodes[0];
        const results = searchTextContent(mutationRootNode, playerNames);
        if (results.length > 0) {
          observer.disconnect();
          locateAndFormatResults(mutationRootNode, results);
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
};

// consider moving to background script, or fetching and caching in local storage on first use
const playerNames = playersById.map((player) => {
  return player.name;
});

const body = document.body;
const initialResults = searchTextContent(body, playerNames);

if (initialResults.length > 0) {
  locateAndFormatResults(body, initialResults);
}

observeMutations(playerNames);
