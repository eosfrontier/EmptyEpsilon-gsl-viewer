// Create and manage the HTML canvas to visualize game state at a point in time.
class Canvas {
  constructor () {
    // Load fonts for canvas use.
    const textFont = new FontFace('Big Shoulders', 'url(fonts/BigShoulders/BigShouldersText-VariableFont_wght.ttf)');
    const iconFont = new FontFace('EmptyEpsilon Icons', 'url(fonts/icons-font/icons-font.woff)');

    textFont.load().then((textFont) => { document.fonts.add(textFont); });
    iconFont.load().then((iconFont) => { document.fonts.add(iconFont); });

    // Toggle hitcanvas layer drawing.
    this._debugDrawing = false;

    // Each sector is a 20U square.
    this.sectorSize = 20000.0;

    // Initialize tracking for throttling zoom/mousewheel events.
    this._zoomThrottle = false;

    // Initialize view locking on selected objects.
    this.isViewLocked = false;

    // Get canvases for background (grid, terrain) and foreground (ships, stations) objects.
    this._backgroundCanvas = $("#canvas-bg");
    this._canvas = $("#canvas-fg");
    this._tokenOverlay = $("#token-overlay");
    this._tokenContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this._tokenOverlay[0].appendChild(this._tokenContainer);

    // Custom user tokens
    this._userObjects = {};
    this._userHistory = [];
    this._userObjectCounter = 0;
    this._currentTool = 'pan';
    this._panActive = false;
    this._tokenClicked = false;
    this._isDrawing = false;
    this._currentStrokeId = null;
    this._drawColor = '#2563eb'; // Default color
    this._drawThickness = 100; // Default thickness

    // Get the infobox for displaying selected object data.
    this._infobox = $("#infobox");

    // Initialize the currently selected object.
    this._selectedObject = {
      "type": "No selection"
    };

    // Initialize Image objects for rendering sprites.
    this.nebulaImages = [
      new Image(),
      new Image(),
      new Image()
    ];

    for (let i = 0; i < this.nebulaImages.length; i += 1) {
      this.nebulaImages[i].src = `images/Nebula${i + 1}.png`;
    }

    this.wormHoleImages = [
      new Image(),
      new Image(),
      new Image()
    ];

    for (let i = 0; i < this.wormHoleImages.length; i += 1) {
      this.wormHoleImages[i].src = `images/wormHole${i + 1}.png`;
    }

    this.blackHoleImage = new Image();
    this.blackHoleImage.src = "images/blackHole3d.png";

    // Create the hit canvas for clickable objects. We won't draw this for the user.
    // https://lavrton.com/hit-region-detection-for-html5-canvas-and-how-to-listen-to-click-events-on-canvas-shapes-815034d7e9f8/
    this._hitCanvas = document.createElement("canvas");
    $(this._hitCanvas).attr("id", "canvas-hit");

    // 100px = 20000U, or 1 sector
    const zoomScalePixels = 100.0,
      zoomScaleUnits = this.sectorSize;

    // Handle canvas mouse events.
    this._canvas.mousedown((event) => this._mouseDown(event));
    this._canvas.mousemove((event) => this._mouseMove(event));

    // Bind mouseup to the document to correctly end drawing or panning even if the mouse is released outside the canvas.
    $(document).on('mouseup', (event) => {
      // If we are drawing or panning, we want to stop regardless of where the mouse is released.
      if (this._isDrawing || this._panActive) {
        this._mouseUp(event);
      } else if (event.target === this._canvas[0]) { // For other actions (like selection clicks), only trigger if the event happened on the canvas.
        this._mouseUp(event);
      }
    });

    // Handle infobox events via delegation. This is more robust than re-binding events every time the infobox is rendered.
    this._infobox.on('click', '.shape-button', (event) => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      const token = this._selectedObject;
      this._infobox.find('.shape-button').removeClass('ee-button-active');
      $(event.currentTarget).addClass('ee-button-active');
      token.shape = $(event.currentTarget).data('shape');
      this.updateTokenElement(token);
    });

    this._infobox.on('input', '#token_callsign', (event) => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this._selectedObject.callsign = $(event.currentTarget).val();
      this.updateTokenElement(this._selectedObject);
    });

    this._infobox.on('change', '#token_faction', (event) => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this._selectedObject.faction = $(event.currentTarget).val();
      this.updateTokenElement(this._selectedObject);
    });

    this._infobox.on('input', '#token_size_selector', (event) => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this._selectedObject.size = parseFloat($(event.currentTarget).val());
      this.updateTokenElement(this._selectedObject);
    });

    this._infobox.on('input', '#token_rotation_selector', (event) => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this._selectedObject.rotation = parseInt($(event.currentTarget).val(), 10);
      this.updateTokenElement(this._selectedObject);
    });

    this._infobox.on('click', '#save_token', () => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this._selectedObject = { type: "No selection" };
      this._infobox.removeClass('centered-infobox').hide();
      this.update();
    });

    this._infobox.on('click', '#delete_token', () => {
      if (!this._selectedObject || !this._selectedObject.isCustom) return;
      this.removeToken(this._selectedObject.id);
    });

    this._canvas.bind("wheel", (event) => {
      // Prevent default scroll behavior in Webkit
      event.preventDefault();
      this._mouseWheel(event);
    });

    // Update canvas on window resize.
    $(window).resize(() => this.update());

    // Load any persisted user objects from the page
    this.loadAnnotationsFromPage();

    // Initialize view origin, zoom, and options.
    this._view = {
      "x": 0.0,
      "y": 0.0
    };

    // Initialize target point in world space.
    //
    // this._worldPoint = {
    //   "x": 0.0,
    //   "y": 0.0
    // };

    // Initialize drag delta points.
    this._firstMouse = {
      "x": 0.0,
      "y": 0.0
    };
    this._lastMouse = {
      "x": 0.0,
      "y": 0.0
    };

    // Disable callsigns by default.
    this.showCallsigns = false;

    // Initialize zoom scale at 20U = 100 pixels.
    this._zoomScale = zoomScalePixels / zoomScaleUnits;
    $("#zoom_selector").val(this._zoomScale * 1000.0);

    // Update the initialized canvas.
    this.update();
  }

  setCurrentTool(tool) {
    this._currentTool = tool;
    this._panActive = false; // Stop panning when tool changes
    let cursor = 'crosshair';
    if (tool === 'pan') {
      cursor = 'grab';
    }
    this._canvas.css('cursor', cursor);
  }

  screenToWorld(clientX, clientY) {
    const rect = this._canvas[0].getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const worldX = this._view.x + (clientX - rect.left - width / 2) / this._zoomScale;
    const worldY = this._view.y + (clientY - rect.top - height / 2) / this._zoomScale;
    return { x: worldX, y: worldY };
  }

  setDrawColor(color) {
    this._drawColor = color;
  }

  setDrawThickness(thickness) {
    this._drawThickness = parseInt(thickness, 10);
  }

  saveAnnotationsToServer() {
    const plainObjects = {};
    for (const id in this._userObjects) {
      const obj = this._userObjects[id];
      let plainObj;
      if (obj.type === 'token') {
        plainObj = {
          id: obj.id,
          type: obj.type,
          isCustom: obj.isCustom,
          callsign: obj.callsign,
          position: obj.position,
          rotation: obj.rotation,
          size: obj.size,
          faction: obj.faction,
          shape: obj.shape
        };
      } else if (obj.type === 'stroke') {
        plainObj = {
          id: obj.id,
          type: obj.type,
          d: obj.d,
          color: obj.pathEl.getAttribute('stroke'),
          thickness: obj.pathEl.getAttribute('stroke-width')
        };
      }
      if (plainObj) {
        plainObjects[id] = plainObj;
      }
    }

    const dataToSave = {
      objects: plainObjects,
      history: this._userHistory,
      counter: this._userObjectCounter
    };

    const formData = new FormData();
    formData.append('data', JSON.stringify(dataToSave));

    fetch('save_annotations.php', {
      method: 'POST',
      body: formData,
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        console.log('Annotations saved:', data.message);
      } else {
        throw new Error(data.message || 'Unknown error saving annotations.');
      }
    })
    .catch((error) => {
      console.error('Error saving annotations:', error);
      alert('Error: Could not save annotations to the server. ' + error.message);
    });
  }

  loadAnnotationsFromPage() {
    const annotationsElement = document.getElementById('default-annotations-data');
    if (!annotationsElement) return;

    const savedData = annotationsElement.textContent;
    if (!savedData || savedData.trim().length === 0) return;

    try {
      const data = JSON.parse(savedData);

      this._userObjectCounter = data.counter || 0;
      this._userHistory = data.history || [];
      this._userObjects = {}; // Clear existing before loading

      // Recreate objects
      for (const id in data.objects) {
        const plainObj = data.objects[id];
        if (plainObj.type === 'token') {
          this.recreateToken(plainObj);
        } else if (plainObj.type === 'stroke') {
          this.recreateStroke(plainObj);
        }
      }
    } catch (e) {
      console.error("Failed to load user objects from page data", e);
    }
  }

  recreateToken(plainObj) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute('data-id', plainObj.id);
    g.style.cursor = 'pointer';

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute('y', 550);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', "'Big Shoulders', 'Bebas Neue Book', Impact, Arial, sans-serif");
    text.setAttribute('font-size', '350px');
    text.setAttribute('stroke', '#000');
    text.setAttribute('stroke-width', '30');
    text.setAttribute('paint-order', 'stroke');
    g.appendChild(text);

    const token = { ...plainObj, element: g };
    this._userObjects[token.id] = token;

    this.updateTokenElement(token);
    this._attachTokenDragEvents(token);
    this._tokenContainer.appendChild(g);
  }

  recreateStroke(plainObj) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.cursor = 'pointer';

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', plainObj.color);
    path.setAttribute('stroke-width', plainObj.thickness);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', plainObj.d);
    g.appendChild(path);

    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    // Make hit area wider
    hitPath.setAttribute('stroke-width', parseInt(plainObj.thickness, 10) + 40);
    hitPath.setAttribute('stroke-linecap', 'round');
    hitPath.setAttribute('stroke-linejoin', 'round');
    hitPath.setAttribute('d', plainObj.d);
    g.appendChild(hitPath);

    const stroke = { ...plainObj, element: g, pathEl: path, hitEl: hitPath };
    this._userObjects[stroke.id] = stroke;

    this._attachStrokeEvents(stroke);
    this._tokenContainer.appendChild(g);
  }

  // Record cursor coordinates on click and release, for dragging.
  _mouseDown(event) {
    if (this._currentTool === 'draw') {
      this._isDrawing = true;
      const worldPos = this.screenToWorld(event.clientX, event.clientY);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.style.cursor = 'pointer';

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this._drawColor);
      path.setAttribute('stroke-width', this._drawThickness);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      g.appendChild(path);

      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', this._drawThickness + 40);
      hitPath.setAttribute('stroke-linecap', 'round');
      hitPath.setAttribute('stroke-linejoin', 'round');
      g.appendChild(hitPath);

      const d = `M ${worldPos.x} ${worldPos.y}`;
      path.setAttribute('d', d);
      hitPath.setAttribute('d', d);

      const strokeObj = this.addUserObject('stroke', { element: g, pathEl: path, hitEl: hitPath, d: d });
      this._currentStrokeId = strokeObj.id;
      this._attachStrokeEvents(strokeObj);
      this._tokenContainer.appendChild(g);
      return;
    }
    if (this._currentTool === 'add_token') {
      const worldPos = this.screenToWorld(event.clientX, event.clientY);
      this.addToken(worldPos.x, worldPos.y);
      return;
    }

    // Default 'pan' tool behavior
    this._firstMouse.x = event.clientX;
    this._firstMouse.y = event.clientY;
    this._lastMouse.x = this._firstMouse.x;
    this._lastMouse.y = this._firstMouse.y;
    this._panActive = true;
    this._canvas.css('cursor', 'grabbing');
  }

  // Handle the end of click/drag events.
  _mouseUp(event) {
    if (this._isDrawing) {
      this._isDrawing = false;
      this._currentStrokeId = null;
      return;
    }

    // If a token was just clicked, its own handler has already dealt with selection.
    // Prevent the canvas mouseup from overriding it.
    if (this._tokenClicked) {
      this._tokenClicked = false;
      return;
    }

    if (this._panActive) {
      this._panActive = false;
      this._canvas.css('cursor', 'grab');
    }

    const isDrag = this._lastMouse.x !== this._firstMouse.x || this._lastMouse.y !== this._firstMouse.y;

    // Detect a non-drag click by confirming the mouse didn't move since mousedown.
    if (!isDrag && this._currentTool === 'pan') {
      // Get mouse position relative to the canvas and check its hit canvas pixel.
      const mousePosition = {
        "x": event.clientX - this._canvas[0].offsetLeft,
        "y": event.clientY - this._canvas[0].offsetTop
      };
      const ctxHit = this._hitCanvas.getContext("2d", { "alpha": false });
      const pixel = ctxHit.getImageData(mousePosition.x, mousePosition.y, 1, 1).data;
      let newSelection = null;

      const id = Canvas.rgbToId(pixel[0], pixel[1], pixel[2]);
      if (id > 0) {
        const time = $("#time_selector").val();
        const entry = log.getEntriesAtTime(time);
        newSelection = entry[id];
      }
      this._selectedObject = newSelection;

      // Confirm whether the selection is valid.
      if (Canvas.isSelectionValid(this._selectedObject)) {
        // Update the infobox with this object's info for this point in time.
        this.updateSelectionInfobox();

        // If view locking is enabled, point the camera at the selected object.
        if (this.isViewLocked === true) {
          this.pointCameraAt(this._selectedObject.position[0], this._selectedObject.position[1]);
        }

        // Update the canvas.
        this.update();
      } else {
        // Otherwise, hide the infobox if there's no selected object.
        this._selectedObject = { type: "No selection" };
        this._infobox.removeClass('centered-infobox');
        this._infobox.hide();
        this.update();
      }
    }
  }

  // The hell is wrong with you, javascript? https://www.codereadability.com/how-to-check-for-undefined-in-javascript/
  static isUndefined (value) {
    // Obtain "undefined" value that's guaranteed to not have been re-assigned.
    // eslint-disable-next-line no-shadow-restricted-names
    const undefined = void (0);
    return value === undefined;
  }

  // Format scenario time from seconds to into HH:mm:ss.
  static formatTime (time) {
    const result = new Date(time * 1000).toISOString().slice(11,19);
    return `${result}`;
  }

  // Check whether the given object is defined, and still present and valid.
  static isSelectionValid (selectedObject) {
    // selectedObject can't have a default value. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters#Passing_undefined_vs._other_falsy_values
    if (Canvas.isUndefined(selectedObject) ||
      selectedObject === null) {
      // If the object is undefined or null, it's invalid.
      // console.debug(`Object is invalid: ${selectedObject}`);
      return false;
    } else if (selectedObject.id < 1 ||
      selectedObject.type === "No selection") {
      // If the object has an invalid ID or explicitly "No selection", nothing's selected.
      // console.debug("No object selected");
      return false;
    }

    // Must be valid otherwise.
    return true;
  }

  // Move the camera to the given world-space coordinates.
  pointCameraAt (positionX, positionY) {
    if (typeof positionX === "number" && typeof positionY === "number") {
      this._view.x = positionX;
      this._view.y = positionY;
    } else {
      console.error(`Invalid position values ${positionX}, ${positionY}`);
    }
  }

  undo() {
    if (this._userHistory.length === 0) return;
    const lastId = this._userHistory.pop();

    const obj = this._userObjects[lastId];
    if (obj && obj.element) obj.element.remove();
    delete this._userObjects[lastId];

    if (this._selectedObject && this._selectedObject.id === lastId) {
      this._selectedObject = { type: "No selection" };
      this._infobox.removeClass('centered-infobox').hide();
    }
    this.update();
  }

  addUserObject(type, data) {
    const id = 'user_' + this._userObjectCounter++;
    const obj = { id, type, ...data };
    this._userObjects[id] = obj;
    this._userHistory.push(id);
    return obj;
  }

  removeUserObject(id) {
    const obj = this._userObjects[id];
    if (!obj) return;

    if (obj.element) obj.element.remove();
    delete this._userObjects[id];

    this._userHistory = this._userHistory.filter(hId => hId !== id);

    if (this._selectedObject && this._selectedObject.id === id) {
      this._selectedObject = { type: "No selection" };
      this._infobox.removeClass('centered-infobox').hide();
    }
    this.update();
  }

  addToken(worldX, worldY) {
    const tokenData = {
      isCustom: true,
      type: 'Custom Token',
      callsign: 'Custom Token ' + this._userObjectCounter,
      position: [worldX, worldY],
      rotation: 0,
      size: 1.0,
      faction: 'ICC', // default
      shape: 'ship'
    };

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const token = this.addUserObject('token', tokenData);
    const id = token.id;
    g.setAttribute('data-id', id);
    g.style.cursor = 'pointer';

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute('y', 550);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', "'Big Shoulders', 'Bebas Neue Book', Impact, Arial, sans-serif");
    text.setAttribute('font-size', '350px');
    text.setAttribute('stroke', '#000');
    text.setAttribute('stroke-width', '30');
    text.setAttribute('paint-order', 'stroke');
    g.appendChild(text);

    token.element = g;
    this.updateTokenElement(token); // Set initial appearance

    // Drag logic
    this._attachTokenDragEvents(token);

    this._tokenContainer.appendChild(g);
    this._selectedObject = token;
    this.updateSelectionInfobox();
    this.update();
  }

  _attachStrokeEvents(stroke) {
    const g = stroke.element;
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this._currentTool === 'delete') {
        this.removeUserObject(stroke.id);
      }
    });
  }

  _attachTokenDragEvents(token) {
    const g = token.element;
    g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent default browser actions like text selection
        if (this._currentTool !== 'pan') return;

        if (this._currentTool === 'delete') {
            this.removeUserObject(token.id);
            return;
        }

        this._tokenClicked = true;

        let dragMoved = false;
        const dragThreshold = 3;
        const startClient = { x: e.clientX, y: e.clientY };

        const dragStartWorld = this.screenToWorld(e.clientX, e.clientY);
        const dragStartPos = { x: token.position[0], y: token.position[1] };

        const onPointerMove = (moveEvent) => {
            const dx = moveEvent.clientX - startClient.x;
            const dy = moveEvent.clientY - startClient.y;

            if (!dragMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                dragMoved = true;
                // A drag has started. If a token is selected, deselect it to hide the infobox.
                if (this._selectedObject && this._selectedObject.isCustom) {
                    this._selectedObject = { type: "No selection" };
                    this._infobox.removeClass('centered-infobox').hide();
                    this.update();
                }
            }

            if (dragMoved) {
                const currentWorld = this.screenToWorld(moveEvent.clientX, moveEvent.clientY);
                const dWorldX = currentWorld.x - dragStartWorld.x;
                const dWorldY = currentWorld.y - dragStartWorld.y;
                token.position[0] = dragStartPos.x + dWorldX;
                token.position[1] = dragStartPos.y + dWorldY;
                this.updateTokenElement(token);
            }
        };
        const onPointerUp = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            if (!dragMoved) {
                // This was a click.
                this._selectedObject = token;
                this.updateSelectionInfobox();
                this.update();
            }
        };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });
  }

  updateTokenElement(token) {
    const g = token.element;

    // Remove existing shape if it exists, and create a new one.
    const oldShape = g.querySelector('.token-shape');
    if (oldShape) oldShape.remove();

    let shapeEl;
    switch (token.shape) {
    case 'station':
      shapeEl = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const hexSize = 400;
      let hexPoints = "";
      for (let i = 0; i < 6; i++) {
        hexPoints += `${hexSize * Math.cos(i * 2 * Math.PI / 6)},${hexSize * Math.sin(i * 2 * Math.PI / 6)} `;
      }
      shapeEl.setAttribute('points', hexPoints.trim());
      break;
    case 'marker':
      shapeEl = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      shapeEl.setAttribute('points', '0,-400 300,0 0,400 -300,0');
      break;
    case 'ship':
    default:
      shapeEl = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      shapeEl.setAttribute('points', '0,-400 -280,200 280,200');
      break;
    }
    shapeEl.classList.add('token-shape');
    g.insertBefore(shapeEl, g.firstChild); // insert before text

    const text = g.querySelector('text');

    const factionColor = Canvas.getFactionColor(token.faction, "CC", "FF");
    shapeEl.setAttribute('fill', factionColor);
    text.setAttribute('fill', factionColor);
    text.textContent = token.callsign;

    const transform = `translate(${token.position[0]}, ${token.position[1]}) rotate(${token.rotation}) scale(${token.size})`;
    g.setAttribute('transform', transform);
  }

  removeToken(tokenId) {
    this.removeUserObject(tokenId);
  }

  // Zoom camera in (positive zoomFactor), out (negative zoomFactor), or to a given level (zoomValue).
  zoomCamera (zoomFactor = 1, zoomValue = null) {
    // If a valid zoomValue is passed, just go to it.
    if (zoomValue > 0 && zoomValue < 0.15) {
      this._zoomScale = zoomValue;
    } else if (zoomFactor > -3 && zoomFactor < 3) {
      // Otherwise, zoom in or out relative to the existing zoomScale by the given zoomFactor.
      this._zoomScale = Math.max(0.002, Math.min(0.15, this._zoomScale + (zoomFactor * (Math.max(0.001, Math.min(0.1, this._zoomScale * this._zoomScale))))));
    } else {
      console.error("Invalid zoomValue or zoomFactor");
      return;
    }

    // Update the Canvas.
    this.update();

    // Update zoom selector bar value with the new zoom scale.
    $("#zoom_selector").val(this._zoomScale * 1000.0);
  }

  // Update the selected object for the current point in the timeline.
  updateSelection (timeValue = $("#time_selector").val()) {
    const {id} = this._selectedObject,
      entry = log.getEntriesAtTime(timeValue);

    this._selectedObject = entry[id];
  }

  // Normalize the given heading to 0-360.
  static normalizeHeading (heading) {
    while (heading >= 360.0) {
      heading -= 360.0;
    }

    while (heading < 0.0) {
      heading += 360.0;
    }

    return heading;
  }

  // Convert an integer shield/beam frequency to a string.
  static frequencyToString (frequency) {
    return `${400 + (frequency * 20)} THz`;
  }

  // TODO: Break infobox handling into its own class, use DOM instead of hardcoded HTML,
  // render all elements, update them each tick, and toggle unusued ones instead of rewriting the whole infobox each tick
  updateSelectionInfobox (timeValue = $("#time_selector").val()) {
    // Clear the infobox and don't bother continuing if the selected object isn't valid.
    if (Canvas.isSelectionValid(this._selectedObject) === false) { // eslint-disable-line
      this._infobox.removeClass('centered-infobox');
      this._infobox.hide();
      return;
    }

    // Handle custom tokens separately
    if (this._selectedObject.isCustom) {
      this._infobox.addClass('centered-infobox');
      const token = this._selectedObject;
      const infoboxContent = $("#infobox-content");
      let infoboxContents = "";
      infoboxContents += `<tr class="ee-infobox-title"><td colspan=2 class="ee-infobox-header">Custom Token</td>`;
      infoboxContents += `<tr><td class="ee-table-key">Callsign</td><td class="ee-table-value"><input type="text" id="token_callsign" value="${token.callsign}"></td></tr>`;
      infoboxContents += `<tr><td class="ee-table-key">Faction</td><td class="ee-table-value"><select id="token_faction"></select></td></tr>`;
      infoboxContents += `<tr><td class="ee-table-key">Shape</td><td class="ee-table-value shape-selector-row">
        <button class="ee-button shape-button" data-shape="ship" title="Ship">▲</button>
        <button class="ee-button shape-button" data-shape="station" title="Station">⬢</button>
        <button class="ee-button shape-button" data-shape="marker" title="Marker">♦</button>
      </td></tr>`;
      infoboxContents += `<tr><td class="ee-table-key">Position</td><td class="ee-table-value">${token.position[0].toFixed(1)}, ${token.position[1].toFixed(1)}</td></tr>`;
      infoboxContents += `<tr><td class="ee-table-key">Size</td><td><input class="ee-slider" id="token_size_selector" type="range" min="0.2" max="5" step="0.1" value="${token.size}"></td></tr>`;
      infoboxContents += `<tr><td class="ee-table-key">Rotation</td><td><input class="ee-slider" id="token_rotation_selector" type="range" min="0" max="359" step="1" value="${token.rotation}"></td></tr>`;
      infoboxContents += `<tr><td colspan="2" class="infobox-actions"><button class="ee-button" id="save_token">Save</button> <button class="ee-button" id="delete_token">Delete</button></td></tr>`;

      this._infobox.show();
      infoboxContent.html(infoboxContents);

      // Populate faction dropdown
      const factions = ["ICC", "Aquila", "Dugo", "Ekanesh", "Pendzal", "Sona", "Alien", "Other", "Unknown"];
      const factionSelect = $("#token_faction");
      factions.forEach(f => {
        factionSelect.append($('<option>', { value: f, text: f }));
      });
      factionSelect.val(token.faction);

      // Set active shape button state. The event handlers are now delegated and live in the constructor.
      this._infobox.find('.shape-button').removeClass('ee-button-active');
      this._infobox.find(`.shape-button[data-shape="${token.shape}"]`).addClass('ee-button-active');

      return;
    }

    this._infobox.removeClass('centered-infobox');
    const selectedObject = this._selectedObject;

    // Update the selected object for the current time.
    this.updateSelection(timeValue);

    if (!this._selectedObject) {
      this._infobox.hide();
      this._infobox.removeClass('centered-infobox');
      return;
    }

    // Populate the infobox with data.
    const infoboxContent = $("#infobox-content");
    let infoboxContents = "",
      cssFaction = "no_faction",
      // Rotation at 0.0 points right/east. Adjust it so 0.0 points up/north.
      heading = Canvas.normalizeHeading(selectedObject.rotation + 90.0);

    // Style the faction if present.
    if ("faction" in selectedObject) {
      cssFaction = selectedObject.faction.split(" ").join("_");
    }

    // Initialize the ordered output.
    const objectOutput = [];

    // Title is the callsign if present (object type if not), with faction if one is assigned.
    if ("callsign" in selectedObject) {
      if ("faction" in selectedObject) {
        objectOutput.push({"key": "h1", "value": `${selectedObject.callsign} (${selectedObject.faction})`});
      } else {
        objectOutput.push({"key": "h1", "value": selectedObject.callsign});
      }
    } else if ("faction" in selectedObject) {
      objectOutput.push({"key": "h1", "value": `${selectedObject.type} (${selectedObject.faction})`});
    } else {
      objectOutput.push({"key": "h1", "value": selectedObject.type});
    }

    // Add ship type. Flag if it's a player ship.
    switch (selectedObject.type) {
      case "PlayerSpaceship":
        objectOutput.push({"key": "Type", "value": `${selectedObject.ship_type} (Player)`});
        break;
      case "SpaceStation":
        objectOutput.push({"key": "Type", "value": selectedObject.station_type});
        break;
      case "CpuShip":
        objectOutput.push({"key": "Type", "value": selectedObject.ship_type});
        break;
      default:
        objectOutput.push({"key": "Type", "value": selectedObject.type});
    }

    // Display the object's coordinates.
    objectOutput.push({"key": "Position", "value": `${selectedObject.position[0].toFixed(1)}, ${selectedObject.position[1].toFixed(1)} (${Canvas.getSectorDesignation(selectedObject.position[0], selectedObject.position[1], this.sectorSize)})`});

    // # Maneuvering
    objectOutput.push({"key": "h1", "value": "Maneuvering"});

    // Display the objects heading, and its target heading if it has input.
    if ("input" in selectedObject) {
      objectOutput.push({"key": "Heading", "value": `${heading.toFixed(1)}° (plotted ${Canvas.normalizeHeading(selectedObject.input.rotation + 90).toFixed(1)}°)`});
    } else {
      objectOutput.push({"key": "Heading", "value": `${heading.toFixed(1)}°`});
    }

    // Display maneuvering capabilities, if any.
    if ("config" in selectedObject) {
      if ("turn_speed" in selectedObject.config) {
        objectOutput.push({"key": "Rotation rate", "value": `${Math.max(0, ((selectedObject.systems["Maneuvering"]["power_level"] * selectedObject.systems["Maneuvering"]["health"]) * selectedObject.config.turn_speed).toFixed(1))}°/sec.`});
      }

      if ("impulse_speed" in selectedObject.config) {
        objectOutput.push({"key": "h2", "value": "Impulse Propulsion"});

        if ("Impulse Engines" in selectedObject.systems) {
          objectOutput.push({"key": "Speed", "value": `${Math.max(0, ((selectedObject.systems["Impulse Engines"]["power_level"] * selectedObject.systems["Impulse Engines"]["health"]) * (selectedObject.config.impulse_speed * selectedObject.output.impulse)).toFixed(1))} (max ${Math.max(0, ((selectedObject.systems["Impulse Engines"]["power_level"] * selectedObject.systems["Impulse Engines"]["health"]) * selectedObject.config.impulse_speed).toFixed(1))})`});
        } else {
          objectOutput.push({"key": "Speed", "value": `${Math.max(0, selectedObject.config.impulse_speed * selectedObject.output.impulse).toFixed(1)} (max ${Math.max(0, selectedObject.config.impulse_speed).toFixed(1)})`});
        }

        objectOutput.push({"key": "Acceleration", "value": `${(selectedObject.config.impulse_acceleration)}`});
        objectOutput.push({"key": "Throttle", "value": `${Math.floor(selectedObject.output.impulse * 100)}% (target ${Math.floor(selectedObject.input.impulse * 100)}%)`});
      }

      if ("combat_maneuver_boost" in selectedObject.config) {
        objectOutput.push({"key": "h2", "value": "Combat Maneuvering"});
        objectOutput.push({"key": "Charge", "value": `${Math.floor(selectedObject.output.combat_maneuver_charge * 100)}% available`});
        objectOutput.push({"key": "Boost", "value": `${Math.floor(selectedObject.output.combat_maneuver_boost * 100)}% engaged`});
        objectOutput.push({"key": "Strafe", "value": `${Math.floor(selectedObject.output.combat_maneuver_strafe * 100)}% engaged`});
      }

      // Report on the jump drive.
      if ("jumpdrive" in selectedObject.config) {
        objectOutput.push({"key": "h2", "value": "Jump Drive"});

        // `charge` is in the object only if we're not currently jumping.
        if ("output" in selectedObject && "jump" in selectedObject.output) {
          if ("charge" in selectedObject.output.jump) {
            // If we're not jumping, report so and track the current charge.
            objectOutput.push({"key": "Drive", "value": "Idle"});
            objectOutput.push({"key": "Charge", "value": Math.floor(selectedObject.output.jump.charge)});
            objectOutput.push({"key": "Distance", "value": "—"});
            objectOutput.push({"key": "Delay", "value": "—"});
          } else {
            // If we're jumping, report so and track the jump distance and time to jump.
            objectOutput.push({"key": "Drive", "value": "Engaged"});
            objectOutput.push({"key": "Charge", "value": "—"});
            objectOutput.push({"key": "Distance", "value": `${(selectedObject.output.jump.distance / 1000).toFixed(1)}U`});
            objectOutput.push({"key": "Time to Jump", "value": `${(selectedObject.output.jump.delay).toFixed(1)} sec.`});
          }
        }
      }

      // Report on the warp drive.
      if ("config" in selectedObject) {
        if ("warp" in selectedObject.config) {
          objectOutput.push({"key": "h2", "value": "Warp Drive"});
          objectOutput.push({"key": "Speed", "value": `${Math.floor(selectedObject.output.warp)} (max ${Math.floor(selectedObject.config.warp)})`});
          objectOutput.push({"key": "Factor setting", "value": selectedObject.input.warp.toFixed(1)});
        }
      }
    }

    // // Target: target ID -> convert ID to callsign || No target
    // if ("target" in selectedObject) {
    //   objectOutput.push({"key": "Target", "value": selectedObject.target});
    // } else {
    //   objectOutput.push({"key": "Target", "value": "None"});
    // }

    // Report on defensive capabilities, if the object has any. Start with the hull.
    if ("hull" in selectedObject) {
      objectOutput.push({"key": "h1", "value": "Defenses"});
      objectOutput.push({"key": "Hull", "value": `${Math.floor(selectedObject.hull)} (${Math.floor((selectedObject.hull / selectedObject.config.hull) * 100)}%)`});
    }

    // (If more than 0 shields)
    if ("shields" in selectedObject) {
      // Shield frequency: shield_frequency -> convert int to hz equivalent
      // return string(400 + (frequency * 20)) + "THz";
      if ("shield_frequency" in selectedObject) {
        objectOutput.push({"key": "Shield frequency", "value": Canvas.frequencyToString(selectedObject.shield_frequency)});
      }

      switch (selectedObject.shields.length) {
        case 1:
          objectOutput.push({"key": "Shields", "value": `${Math.floor(selectedObject.shields[0])} (${Math.floor(selectedObject.shields[0] / selectedObject.config.shields[0] * 100)}%)`});
          break;
        case 2:
          objectOutput.push({"key": "Fore shields", "value": `${Math.floor(selectedObject.shields[0])} (${Math.floor(selectedObject.shields[0] / selectedObject.config.shields[0] * 100)}%)`});
          objectOutput.push({"key": "Aft shields", "value": `${Math.floor(selectedObject.shields[1])} (${Math.floor(selectedObject.shields[1] / selectedObject.config.shields[1] * 100)}%)`});
          break;
        case 3:
          objectOutput.push({"key": "Fore shields", "value": `${Math.floor(selectedObject.shields[0])} (${Math.floor(selectedObject.shields[0] / selectedObject.config.shields[0] * 100)}%)`});
          objectOutput.push({"key": "Starboard shields", "value": `${Math.floor(selectedObject.shields[1])} (${Math.floor(selectedObject.shields[1] / selectedObject.config.shields[1] * 100)}%)`});
          objectOutput.push({"key": "Port shields", "value": `${Math.floor(selectedObject.shields[2])} (${Math.floor(selectedObject.shields[2] / selectedObject.config.shields[2] * 100)}%)`});
          break;
        case 4:
          objectOutput.push({"key": "Fore shields", "value": `${Math.floor(selectedObject.shields[0])} (${Math.floor(selectedObject.shields[0] / selectedObject.config.shields[0] * 100)}%)`});
          objectOutput.push({"key": "Starboard shields", "value": `${Math.floor(selectedObject.shields[1])} (${Math.floor(selectedObject.shields[1] / selectedObject.config.shields[1] * 100)}%)`});
          objectOutput.push({"key": "Aft shields", "value": `${Math.floor(selectedObject.shields[2])} (${Math.floor(selectedObject.shields[2] / selectedObject.config.shields[2] * 100)}%)`});
          objectOutput.push({"key": "Port shields", "value": `${Math.floor(selectedObject.shields[3])} (${Math.floor(selectedObject.shields[3] / selectedObject.config.shields[3] * 100)}%)`});
          break;
        default:
          for (let index = 0; index < selectedObject.shields.length - 1; index += 1) {
            objectOutput.push({"key": `Shield ${index + 1}`, "value": `${Math.floor(selectedObject.shields[index])} (${(selectedObject.shields[index] / selectedObject.config.shields[index] * 100)}%)`});
          }
      }
    }

    // Report on weapons.
    if ("config" in selectedObject) {
      // # Beams
      if ("beams" in selectedObject.config) {
        objectOutput.push({"key": "h1", "value": "Beam Weapons"});
        // Beam frequency: beam_frequency -> convert int to hz equivalent
        // 400 + (frequency * 20)) + "THz";
        objectOutput.push({"key": "Beam frequency", "value": Canvas.frequencyToString(selectedObject.beam_frequency)});

        for (let index = 0; index < selectedObject.config.beams.length; index += 1) {
          const beam = selectedObject.config.beams[index];

          // Some ships have a 0-arc beam?
          if (beam.arc > 0) {
            objectOutput.push({"key": "h2", "value": `Beam Weapon ${index + 1}`});
            objectOutput.push({"key": "Bearing", "value": `${Canvas.normalizeHeading(beam.direction)}°`});
            objectOutput.push({"key": "Arc", "value": `${beam.arc}°`});
            objectOutput.push({"key": "Range", "value": `${(beam.range / 1000).toFixed(1)}U`});
            objectOutput.push({"key": "Damage", "value": `${beam.damage} (${(beam.damage / beam.cycle_time).toFixed(1)}/sec.)`});
            objectOutput.push({"key": "Cycle time", "value": `${beam.cycle_time.toFixed(1)} sec.`});

            if ("turret_arc" in beam && beam.turret_arc > 0) {
              objectOutput.push({"key": "Turret Bearing", "value": `${Canvas.normalizeHeading(beam.turret_direction)}°`});
              objectOutput.push({"key": "Turret Arc", "value": `${beam.turret_arc}°`});
            }
          }
        }
      }

      // Enforce the same missile order as the game UI.
      if ("missiles" in selectedObject) {
        objectOutput.push({"key": "h1", "value": "Missiles and Mines"});

        if ("Homing" in selectedObject.config.missiles) {
          // If there are 0 missiles of a type in stock, the value isn't reported at all.
          if ("Homing" in selectedObject.missiles) {
            objectOutput.push({"key": "Homing", "value": `${selectedObject.missiles.Homing} / ${selectedObject.config.missiles.Homing}`});
          } else {
            objectOutput.push({"key": "Homing", "value": `0 / ${selectedObject.config.missiles.Homing}`});
          }
        }

        if ("Nuke" in selectedObject.config.missiles) {
          if ("Nuke" in selectedObject.missiles) {
            objectOutput.push({"key": "Nuke", "value": `${selectedObject.missiles.Nuke} / ${selectedObject.config.missiles.Nuke}`});
          } else {
            objectOutput.push({"key": "Nuke", "value": `0 / ${selectedObject.config.missiles.Nuke}`});
          }
        }

        if ("EMP" in selectedObject.config.missiles) {
          if ("EMP" in selectedObject.missiles) {
            objectOutput.push({"key": "EMP", "value": `${selectedObject.missiles.EMP} / ${selectedObject.config.missiles.EMP}`});
          } else {
            objectOutput.push({"key": "EMP", "value": `0 / ${selectedObject.config.missiles.EMP}`});
          }
        }

        if ("HVLI" in selectedObject.config.missiles) {
          if ("HVLI" in selectedObject.missiles) {
            objectOutput.push({"key": "HVLI", "value": `${selectedObject.missiles.HVLI} / ${selectedObject.config.missiles.HVLI}`});
          } else {
            objectOutput.push({"key": "HVLI", "value": `0 / ${selectedObject.config.missiles.HVLI}`});
          }
        }

        if ("Mine" in selectedObject.config.missiles) {
          if ("Mine" in selectedObject.missiles) {
            objectOutput.push({"key": "Mine", "value": `${selectedObject.missiles.Mine} / ${selectedObject.config.missiles.Mine}`});
          } else {
            objectOutput.push({"key": "Mine", "value": `0 / ${selectedObject.config.missiles.Mine}`});
          }
        }
      }

      // Display info about the tubes.
      if ("tubes" in selectedObject) {
        for (let index = 0; index < selectedObject.config.tubes.length; index += 1) {
          const tube = selectedObject.config.tubes[index],
            tubeState = selectedObject.tubes[index];

          objectOutput.push({"key": "h2", "value": `Weapon Tube ${index + 1}`});

          if ("type" in tubeState) {
            objectOutput.push({"key": "Missile Type", "value": tubeState.type});
          } else {
            objectOutput.push({"key": "Missile Type", "value": "None"});
          }

          // If the tube's doing something, report it. If it's in progress, report the completion %.
          if ("state" in tubeState) {
            if ("progress" in tubeState) {
              objectOutput.push({"key": "State", "value": `${tubeState.state} (${Math.floor(tubeState.progress * 100)}%, ${(tube.load_time - (tubeState.progress * tube.load_time)).toFixed(1)} sec.)`});
            } else {
              objectOutput.push({"key": "State", "value": tubeState.state});
            }
          } else {
            objectOutput.push({"key": "State", "value": "Empty"});
          }

          objectOutput.push({"key": "Bearing", "value": `${Canvas.normalizeHeading(tube.direction)}°`});
          objectOutput.push({"key": "Load time", "value": `${tube.load_time} sec.`});
        }
      }
    }

    // Display system health and status info.
    if ("systems" in selectedObject) {
      objectOutput.push({"key": "h1", "value": "Systems"});

      for (const system in selectedObject.systems) {
        objectOutput.push({"key": "h2", "value": system});

        if ("health" in selectedObject.systems[system]) {
          objectOutput.push({"key": "Health", "value": `${Math.floor(selectedObject.systems[system]["health"] * 100)}%`});
        }

        // We only care about heat, power, and coolant if it's a player ship.
        if (selectedObject.type === "PlayerSpaceship") {
          objectOutput.push({"key": "Power", "value": `${Math.floor(selectedObject.systems[system]["power_level"] * 100)}% (request ${Math.floor(selectedObject.systems[system]["power_request"] * 100)}%)`});
          objectOutput.push({"key": "Heat", "value": `${Math.floor(selectedObject.systems[system]["heat"] * 100)}%`});
          objectOutput.push({"key": "Coolant", "value": `${Math.floor(selectedObject.systems[system]["coolant_level"] * 10)}% (request ${Math.floor(selectedObject.systems[system]["coolant_request"] * 100)}%)`});
        }
      }
    }

    // Populate infobox with object info.
    for (let index = 0; index < objectOutput.length; index += 1) {
      const row = objectOutput[index];

      if (row.key === "h1" || row.key === "h2" || row.key === "h3") {
        // Special handling of the title row
        // row.value === `${selectedObject.callsign} (${selectedObject.faction})`
        if (index === 0) {
          infoboxContents = infoboxContents.concat(`<tr class="ee-infobox-title ee-faction-${cssFaction}"><td colspan=2 class="ee-infobox-header">${row.value}</td>`);          
        } else {
          infoboxContents = infoboxContents.concat(`<tr class="ee-infobox-header-${row.key}"><td colspan=2 class="ee-infobox-header">${row.value}</td>`);
        }
      } else if (row.key !== "" && row.value !== "") {
        infoboxContents = infoboxContents.concat(`<tr class="ee-${row.key}"><td class="ee-table-key">${row.key}</td><td class="ee-table-value">${row.value}</td>`);
      }
    }

    // Show and populate the infobox.
    this._infobox.show();
    infoboxContent.html(infoboxContents);
  }

  // Move view on mouse drag.
  _mouseMove (event) {
    if (this._isDrawing && this._currentStrokeId) {
      const worldPos = this.screenToWorld(event.clientX, event.clientY);
      const obj = this._userObjects[this._currentStrokeId];
      obj.d += ` L ${worldPos.x} ${worldPos.y}`;
      obj.pathEl.setAttribute('d', obj.d);
      obj.hitEl.setAttribute('d', obj.d);
      return;
    }

    if (this._panActive) {
      this._view.x += (this._lastMouse.x - event.clientX) / this._zoomScale;
      this._view.y += (this._lastMouse.y - event.clientY) / this._zoomScale;
      this.update();
    }

    // Update mouse position from event.
    this._lastMouse.x = event.clientX;
    this._lastMouse.y = event.clientY;
  }

  // Zoom view when using the mouse wheel.
  _mouseWheel (event) {
    // Throttle mousewheel zoom to update no more than once every 16.67ms. https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
    if (!this._zoomThrottle) {
      this._zoomThrottle = true;

      setTimeout(() => {
        this._zoomThrottle = false;
      }, 16.67);

      const {wheelDelta} = event.originalEvent,
        {deltaY} = event.originalEvent;
      let delta = 0.0;

      // Cross-browser/platform delta normalization isn't easy: https://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
      if (wheelDelta) {
        // Chrome Win/Mac | Safari Mac | Opera Win/Mac | Edge
        delta = wheelDelta / 120.0;
      }

      if (deltaY) {
        // Firefox Win/Mac | IE
        if (deltaY > 0.0) {
          delta = -1.0;
        } else {
          delta = 1.0;
        }
      }

      // Modify zoom based on delta.
      this.zoomCamera(delta);
    }
  }

  // Convert an object's unique integer ID to a color code, using components from right to left (blue to red).
  static idToHex (id) {
    return Canvas.rgbToHex(Math.floor((id / 256) / 256), Math.floor(id / 256), id % 256);
  }

  // Convert a hit canvas color code to an integer object ID.
  static rgbToId (red, green, blue) {
    return (red * 256 * 256) + (green * 256) + (blue);
  }

  // Updates the canvas.
  update () {
    // Don't bother doing anything else if we don't have a log to read.
    if (!log) {
      return;
    }

    // If a valid object is selected and view locking is enabled, lock the viewport on it.
    if (Canvas.isSelectionValid(this._selectedObject) === true && this.isViewLocked === true && !this._selectedObject.isCustom) {
      this.pointCameraAt(this._selectedObject.position[0], this._selectedObject.position[1]);
    }

    // Set the current scenario time to the time selector's current value. (Should start at 0:00)
    const time = $("#time_selector").val(),
      // Scale the canvas to fill the browser window.
      width = document.documentElement.clientWidth,
      height = document.documentElement.clientHeight,
      // Define zoom limits.
      maxZoom = 1.25,
      minZoom = 0.001,
      // Get the canvas' contexts. We'll use these throughout for drawing.
      ctx = this._canvas[0].getContext("2d"),
      ctxBg = this._backgroundCanvas[0].getContext("2d"),
      ctxHit = this._hitCanvas.getContext("2d", {"alpha": false}),
      // For each entry at the given time, determine its type and draw an appropriate shape.
      entries = log.getEntriesAtTime(time),
      // Current position and zoom text bar values.
      stateTextTime = Canvas.formatTime(time),
      stateTextScale = `100px = ${(0.1 / this._zoomScale).toPrecision(3)}U`,
      stateTextXPos = `X: ${this._view.x.toFixed(1)}`,
      stateTextYPos = `Y: ${this._view.y.toFixed(1)}`,
      stateTextSector = `(${Canvas.getSectorDesignation(this._view.x, this._view.y, this.sectorSize)})`;
      // TODO: Fix out-of-range sector designations in-game.
      // stateText = `${stateTextTime} / ${stateTextZoom} / ${stateTextX} / ${stateTextY} ${stateTextSector}`;

    // Set canvas size to document size.
    this._canvas[0].width = width;
    this._canvas[0].height = height;
    this._backgroundCanvas[0].width = width;
    this._backgroundCanvas[0].height = height;
    this._hitCanvas.width = width;
    this._hitCanvas.height = height;

    // Workaround for weird intermittent canvas bug.
    if (isNaN(this._view.x)) {
      console.error("x was undef: ", this._view.x);
      this._view.x = 0;
    }

    if (isNaN(this._view.y)) {
      console.error("y was undef: ", this._view.y);
      this._view.y = 0;
    }

    // Cap the zoom scales to reasonable levels. maxZoom: 100px = 0.08U, minZoom: 100px = 100U
    this._zoomScale = Math.min(maxZoom, Math.max(minZoom, this._zoomScale));

    // Draw the canvas background.
    ctxBg.fillStyle = "#000000";
    ctxBg.fillRect(0, 0, width, height);

    // Draw the background grid.
    this.drawGrid(ctxBg, this._view.x, this._view.y, width, height, this.sectorSize, "#202040");

    for (const id in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, id)) {
        // Extract entry position and rotation values.
        const entry = entries[id],
          // Lock shapes to whole pixels to avoid subpixel antialiasing as much as possible.
          positionX = Math.floor(((entry.position[0] - this._view.x) * this._zoomScale) + (width / 2.0)),
          positionY = Math.floor(((entry.position[1] - this._view.y) * this._zoomScale) + (height / 2.0)),
          {rotation} = entry,
          // Define common alpha values.
          opaque = 1.0,
          halfTransparent = 0.5,
          mostlyTransparent = 0.3,
          nearlyTransparent = 0.1,
          // Define common size values.
          size5U = 300,
          size05U = 30,
          sizeJammer = 4,
          sizeExplosion = 3,
          sizeCollectible = 2,
          sizeBeamHit = 2,
          sizeMin = 2,
          // Initialize RNG variable for nebula images.
          imageRNG = alea(`${entry.id}`);

        switch (entry.type) {
        case "Zone": {
          console.log("Zone TODO - pull shape, color from data, draw label text");
        }
        break;
        case "Nebula": {
          Canvas.drawImage(ctxBg, positionX, positionY, this._zoomScale, halfTransparent, size5U / 2, this.nebulaImages[Math.floor(imageRNG() * 3)], rotation, true);
        }
        break;
        case "BlackHole": {
          Canvas.drawImage(ctxBg, positionX, positionY, this._zoomScale, opaque, size5U / 2, this.blackHoleImage, rotation, true);
        }
        break;
        case "WormHole": {
          Canvas.drawImage(ctxBg, positionX, positionY, this._zoomScale, opaque, size5U / 2, this.wormHoleImages[Math.floor(imageRNG() * 3)], rotation, true);
        }
        break;
        case "Mine": {
          // Draw mine radius.
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#808080", mostlyTransparent, size05U);

          // Draw mine location.
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#FFFFFF", opaque, sizeMin);
        }
        break;
        case "PlayerSpaceship": {
          // Draw the ship on the foreground canvas, and its hit shape on the hit canvas.
          this.drawShip(ctx, positionX, positionY, entry);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 8.0, 1.33);
        }
        break;
        case "CpuShip": {
          // Draw the ship on the foreground canvas, and its hit shape on the hit canvas.
          this.drawShip(ctx, positionX, positionY, entry);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 8.0, 1.33);
        }
        break;
        case "WarpJammer": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#C89664", opaque, sizeJammer);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 8.0, 1.33);
        }
        break;
        case "SupplyDrop": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#00FFFF", opaque, sizeCollectible);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 8.0, 1.33);
        }
        break;
        case "SpaceStation": {
          // Draw the station on the foreground canvas, and its hit shape on the hit canvas.
          this.drawStation(ctx, positionX, positionY, entry);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 18.0);
        }
        break;
        case "Asteroid": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#FFC864", opaque, sizeMin);
        }
        break;
        case "VisualAsteroid": {
          Canvas.drawCircle(ctxBg, positionX, positionY, this._zoomScale, "#FFC864", mostlyTransparent, sizeMin);
        }
        break;
        case "Artifact": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#FFFFFF", opaque, sizeCollectible);
          Canvas.drawRectangle(ctxHit, positionX, positionY, this._zoomScale, Canvas.idToHex(entry.id), 1.0, 8.0, 1.33);
        }
        break;
        case "Planet": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#0000AA", opaque, Math.floor(entry.planet_radius / 20));
        }
        break;
        case "ScanProbe": {
          // Draw probe scan radius.
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#60C080", nearlyTransparent, size5U);

          // Draw probe location.
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#60C080", opaque, sizeMin);
        }
        break;
        case "Nuke": {
          Canvas.drawShapeWithRotation("delta", ctx, positionX, positionY, this._zoomScale, "#FF4400", opaque, sizeMin, rotation);
        }
        break;
        case "EMPMissile": {
          Canvas.drawShapeWithRotation("delta", ctx, positionX, positionY, this._zoomScale, "#00FFFF", opaque, sizeMin, rotation);
        }
        break;
        case "HomingMissile": {
          Canvas.drawShapeWithRotation("delta", ctx, positionX, positionY, this._zoomScale, "#FFAA00", opaque, sizeMin, rotation);
        }
        break;
        case "HVLI": {
          Canvas.drawShapeWithRotation("delta", ctx, positionX, positionY, this._zoomScale, "#AAAAAA", opaque, sizeMin, rotation);
        }
        break;
        case "BeamEffect": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#AA6600", halfTransparent, sizeBeamHit);
        }
        break;
        case "ExplosionEffect": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#FFFF00", halfTransparent, sizeExplosion);
        }
        break;
        case "ElectricExplosionEffect": {
          Canvas.drawCircle(ctx, positionX, positionY, this._zoomScale, "#00FFFF", halfTransparent, sizeExplosion);
        }
        break;
        default:
          // If an object is an unknown type, log a debug message and display it in fuscia.
          console.error(`Unknown object type: ${entry.type}`);
          Canvas.drawSquare(ctx, positionX, positionY, this._zoomScale, "#FF00FF", opaque, sizeMin);
        }

        // If the object is selected, draw an indicator.
        //if (Canvas.isSelectionValid(this._selectedObject) && "id" in this._selectedObject && entry.id === this._selectedObject.id) {

        // If objects have hull and we're zoomed in close enough, draw an indicator.
        if (this._zoomScale > 0.05 && "config" in entry && "hull" in entry.config) {
          ctx.beginPath();
          ctx.arc(positionX, positionY, Math.max(4, 200 * this._zoomScale), 0, 2 * Math.PI, false);
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = "#0a0";
          ctx.lineWidth = 0.5 + Math.min(5, 3 * (entry.hull / 100.0));
          ctx.stroke();

          // If objects also have shields and we're zoomed in close enough, draw indicators.
          if (this._zoomScale > 0.05 && "config" in entry && "shields" in entry.config) {
            const segmentLength = 2 * Math.PI / entry.config.shields.length,
              initialAngle = Canvas.degreesToRadians(entry.rotation) - (segmentLength / 2);

            for (let index = 0; index < entry.config.shields.length; index += 1) {
              const currentShield = entry.shields[index],
                configShield = entry.config.shields[index],
                gap = Math.min(0.1, (entry.config.shields.length - 1) * 0.1);

              ctx.beginPath();
              ctx.arc(positionX, positionY, Math.max(6, 300 * this._zoomScale), initialAngle + gap + (index * segmentLength), initialAngle + ((index + 1) * segmentLength) - gap, false);

              ctx.globalAlpha = 1.0 * (currentShield / configShield);
              ctx.strokeStyle = "#00f";
              ctx.lineWidth = 0.5 + Math.min(5, 3 * (currentShield / 100.0));
              ctx.stroke();
            }
          }
        }
      }
    }

    // Update SVG overlay viewBox to match the canvas view
    const viewWidth = width / this._zoomScale;
    const viewHeight = height / this._zoomScale;
    const viewX = this._view.x - (viewWidth / 2);
    const viewY = this._view.y - (viewHeight / 2);
    this._tokenOverlay[0].setAttribute('viewBox', `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);

    // Update selection highlight on user objects
    Object.values(this._userObjects).forEach(obj => {
      if (obj.type === 'token') {
        const isSelected = this._selectedObject && this._selectedObject.id === obj.id;
        const shape = obj.element.querySelector('.token-shape');
        if (shape) {
          shape.setAttribute('stroke', isSelected ? '#FFFF00' : '#000000');
          shape.setAttribute('stroke-width', isSelected ? '50' : '25');
        }
      }
    });

    // Draw the info line showing the scenario time, scale, X/Y coordinates, and sector designation.
    ctx.fillStyle = "#fff";
    ctx.font = "20px 'Big Shoulders', 'Bebas Neue Book', Impact, Arial, sans-serif";

    let charXPos = 20;
    let charYPos = 40;

    for (let i in stateTextTime) {
        ctx.fillText(stateTextTime[i], charXPos, charYPos)

        if (stateTextTime[i] === ":") {
            charXPos += 4;
        } else {
            charXPos += 8;
        }
    }

    charXPos += 20;
    ctx.fillText(stateTextScale, charXPos, charYPos);
    charXPos += 110;
    ctx.fillText(stateTextXPos, charXPos, charYPos);
    charXPos += 100;
    ctx.fillText(stateTextYPos, charXPos, charYPos);
    charXPos += 100;
    ctx.fillText(stateTextSector, charXPos, charYPos);

    if (this._debugDrawing === true) {
      ctx.drawImage(this._hitCanvas, 0, 0);
    }
  }

  // Sectors are designated with a letter (Y axis) and number (X axis). Coordinates 0, 0 represent the intersection of
  // F and 5. Each sector is a 20U (20000) square.
  static getSectorDesignation (positionX, positionY, sectorSize) {
    let sectorLetter = String.fromCharCode("F".charCodeAt() + Math.floor(positionY / sectorSize)),
      sectorLetterBigDigit = "",
      // Sector numbers are 0-99. Sector at 0,0 always ends in 5.
      sectorNumber = 5 + Math.floor(positionX / sectorSize);

    // If the sector number would be out of range, loop it around by 100.
    if (sectorNumber < 0) {
      sectorNumber += 100;
    }

    // If the sector letter would be out of range, add a second digit and loop back to "A".
    while (sectorLetter.charCodeAt() > "Z".charCodeAt()) {
      if (sectorLetterBigDigit === "") {
        sectorLetterBigDigit = "A";
      } else {
        sectorLetterBigDigit = String.fromCharCode(sectorLetterBigDigit.charCodeAt() + 1);
      }

      sectorLetter = String.fromCharCode(sectorLetter.charCodeAt() - 26);
    }

    while (sectorLetter.charCodeAt() < "A".charCodeAt()) {
      if (sectorLetterBigDigit === "") {
        sectorLetterBigDigit = "Z";
      } else {
        sectorLetterBigDigit = String.fromCharCode(sectorLetterBigDigit.charCodeAt() - 1);
      }

      sectorLetter = String.fromCharCode(sectorLetter.charCodeAt() + 26);
    }

    return `${sectorLetterBigDigit}${sectorLetter}${sectorNumber}`;
  }

  static drawGridline (ctx, positionX, positionY, horizontal, lineLength, lineStroke, lineColor) {
    // Define gridline stroke width and color.
    ctx.lineWidth = lineStroke;
    ctx.strokeStyle = lineColor;

    // Draw the line.
    ctx.beginPath();
    ctx.moveTo(positionX, positionY);

    if (horizontal) {
      ctx.lineTo(lineLength, positionY);
    } else {
      ctx.lineTo(positionX, lineLength);
    }

    ctx.closePath();
    ctx.stroke();
  }

  drawGrid (ctx, positionX, positionY, canvasWidth, canvasHeight, gridIntervalSize, gridlineColor) {
    // Translate the visible canvas into world coordinates.
    const canvasEdges = {
        "bottom": positionY + ((canvasHeight / 2) / this._zoomScale),
        "left": positionX - ((canvasWidth / 2) / this._zoomScale),
        "right": positionX + ((canvasWidth / 2) / this._zoomScale),
        "top": positionY - ((canvasHeight / 2) / this._zoomScale)
      },
      // Find the first gridlines from the top left.
      gridlineHorizTop = canvasEdges.top - (canvasEdges.top % gridIntervalSize),
      gridlineVertLeft = canvasEdges.left - (canvasEdges.left % gridIntervalSize),
      gridlineVertWorldList = [],
      gridlineVertCanvasList = [],
      gridlineHorizWorldList = [],
      gridlineHorizCanvasList = [],
      gridlineStrokeSize = 0.5;

    let gridlineHoriz = 0,
      gridlineVert = 0;

    // Draw horizontal gridlines until we run out of canvas.
    for (let gridlineHorizPosition = gridlineHorizTop; gridlineHorizPosition <= canvasEdges.bottom;
      gridlineHorizPosition += gridIntervalSize) {
      // Translate screen position to world position.
      gridlineHoriz = ((gridlineHorizPosition - positionY) * this._zoomScale) + (canvasHeight / 2.0);
      gridlineHorizWorldList.push(gridlineHorizPosition);
      gridlineHorizCanvasList.push(gridlineHoriz);

      // Draw gridline.
      Canvas.drawGridline(ctx, 0, gridlineHoriz, true, canvasWidth, gridlineStrokeSize, gridlineColor);
    }

    // Draw vertical gridlines until we run out of canvas.
    for (let gridlineVertPosition = gridlineVertLeft; gridlineVertPosition < canvasEdges.right;
      gridlineVertPosition += gridIntervalSize) {
      // Translate screen position to world position.
      gridlineVert = ((gridlineVertPosition - positionX) * this._zoomScale) + (canvasWidth / 2.0);
      gridlineVertWorldList.push(gridlineVertPosition);
      gridlineVertCanvasList.push(gridlineVert);

      // Draw gridline.
      Canvas.drawGridline(ctx, gridlineVert, 0, false, canvasHeight, gridlineStrokeSize, gridlineColor);
    }

    // Draw sector designations on the grid, unless the grid is zoomed out far enough.
    ctx.fillStyle = gridlineColor;
    ctx.font = "24px 'Big Shoulders', 'Bebas Neue Regular', Impact, Arial, sans-serif";

    if (gridlineHorizCanvasList.length <= 25 && gridlineVertCanvasList.length <= 25) {
      for (let eachGridlineHoriz = 0; eachGridlineHoriz < gridlineHorizCanvasList.length;
        eachGridlineHoriz += 1) {
        for (let eachGridlineVert = 0; eachGridlineVert < gridlineVertCanvasList.length;
          eachGridlineVert += 1) {
          ctx.fillText(
            Canvas.getSectorDesignation(
              gridlineVertWorldList[eachGridlineVert],
              gridlineHorizWorldList[eachGridlineHoriz],
              this.sectorSize
            ),
            gridlineVertCanvasList[eachGridlineVert] + 16,
            gridlineHorizCanvasList[eachGridlineHoriz] + 32
          );
        }
      }
    }
  }

  // Get a hex color code for the faction, with specified magnitude for the color mix.
  // Would be nice to use the GM colors directly from factioninfo.lua.
  // Returns a long hex color string (ie. #FF0000).
  static getFactionColor (faction, lowColorMagnitude, highColorMagnitude) {
    // Faction colors from factionInfo.lua and custom additions.
    // The magnitude parameters are kept for compatibility but are no longer used.
    switch (faction) {
      // Custom colors from user request & suggestions
      case "Aquila": return "#4169E1"; // Blue
      case "Dugo": return "#FF0000"; // Red
      case "Ekanesh": return "#228B22"; // Forest Green
      case "Pendzal": return "#FFA500"; // Orange
      case "Sona": return "#8A2BE2"; // Purple
      case "ICC": return "#FFFFFF"; // White
      case "Alien": return "#483D8B"; // Dark Slate Blue
      case "Other":
      case "Unknown":
        return "#808080"; // Grey

      // Original EmptyEpsilon colors
      case "Human":
      case "Human Navy":
        return "#FFFFFF";
      case "Kraylor":
        return "#FF0000";
      case "Independent":
        return "#808080";
      case "Arlenians":
        return "#FF8000"; // was 255, 128, 0
      case "Exuari":
        return "#FF0080"; // was 255, 0, 128
      case "Ghosts":
        return "#00FF00";
      case "Ktlitans":
        return "#80FF00"; // was 128, 255, 0
      case "TSN":
        return "#FFFF80"; // was 255, 255, 128
      case "USN":
        return "#FF80FF"; // was 255, 128, 255
      case "CUF":
        return "#80FFFF"; // was 128, 255, 255
      default:
        // Everybody else is fuschia.
        console.error(`Unknown faction: ${faction}`);
        return "#FF00FF";
    }
  }

  // Return an effective minimum size for the square, unless its size modifier is huge.
  static calculateMinimumSize (sizeMultiplier, zoomScale, sizeModifier) {
    const hugeSizeModifier = 50;

    if (sizeModifier < hugeSizeModifier) {
      return Math.max(sizeMultiplier * zoomScale, Math.max(2, sizeModifier));
    }

    return sizeMultiplier * zoomScale;
  }

  // Draw a square that scales with the zoom level.
  static drawRectangle (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier, ratio = 1.0) {
    // Set an effective minimum size for the shape.
    const squareSize = Canvas.calculateMinimumSize(sizeModifier * 33.3, zoomScale, sizeModifier);

    // Define the shape's appearance.
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fillColor;

    // Draw the shape.
    ctx.fillRect(positionX - (ratio * (squareSize / 2)), positionY - (1.0 / ratio * (squareSize / 2)), ratio * squareSize, (1.0 / ratio) * squareSize);

    // Reset global alpha.
    ctx.globalAlpha = 1.0;
  }

  // Draw a square that scales with the zoom level.
  static drawSquare (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier) {
    // Deprecate for drawRectangle with a 1.0 ratio.
    Canvas.drawRectangle(ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier);
  }

  // Draw a triangle that scales with the zoom level.
  static drawTriangle (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier) {
    // Set an effective minimum size for the shape.
    const triangleSize = Canvas.calculateMinimumSize(sizeModifier * 33.3, zoomScale, sizeModifier);

    // Define the shape's appearance.
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fillColor;

    // Draw the shape.
    ctx.beginPath();
    ctx.moveTo(positionX - (triangleSize / 2), positionY + triangleSize);
    ctx.lineTo(positionX + (triangleSize / 2), positionY);
    ctx.lineTo(positionX - (triangleSize / 2), positionY - triangleSize);
    ctx.fill();

    // Reset global alpha.
    ctx.globalAlpha = 1.0;
  }

  // Draw a delta (notched triangular icon) that scales with the zoom level.
  static drawDelta (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier) {
    // Set an effective minimum size for the shape.
    const deltaSize = Canvas.calculateMinimumSize(sizeModifier * 33.3, zoomScale, sizeModifier);

    // Define the shape's appearance.
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fillColor;

    // Draw the shape.
    ctx.beginPath();
    ctx.moveTo(positionX - (deltaSize / 2), positionY);
    ctx.lineTo(positionX - deltaSize, positionY + (deltaSize / 1.5));
    ctx.lineTo(positionX + deltaSize, positionY);
    ctx.lineTo(positionX - deltaSize, positionY - (deltaSize / 1.5));
    ctx.fill();

    // Reset global alpha.
    ctx.globalAlpha = 1.0;
  }

  // Draw a hexagon that scales with the zoom level.
  static drawHex (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier) {
    // Set an effective minimum size for the shape.
    const hexSize = Canvas.calculateMinimumSize(sizeModifier * 33.3, zoomScale, sizeModifier) / 2;

    // Define the shape's appearance.
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fillColor;

    // Draw the shape.
    ctx.beginPath();
    ctx.moveTo(positionX + (hexSize * Math.cos(0)), positionY + (hexSize * Math.sin(0)));
    for (let side = 0; side < 7; side += 1) {
      ctx.lineTo(positionX + (hexSize * Math.cos(side * 2 * Math.PI / 6)), positionY + (hexSize * Math.sin(side * 2 * Math.PI / 6)));
    }
    ctx.fill();

    // Reset global alpha.
    ctx.globalAlpha = 1.0;
  }

  // Draw a circle that scales with the zoom level.
  static drawCircle (ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier, drawStroke = false, strokeColor = "#FF00FF", strokeSize = 5, strokeAlpha = 1.0) {
    // Set an effective minimum size for the shape.
    const circleSize = Canvas.calculateMinimumSize(sizeModifier * 33.3, zoomScale, sizeModifier / 2);

    // Define the shape's appearance.
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = fillColor;

    // Draw the shape.
    ctx.beginPath();
    ctx.arc(positionX, positionY, circleSize / 2, 0, 2 * Math.PI, false);
    ctx.fill();

    // Draw a stroke around the shape, if enabled.
    if (drawStroke) {
      ctx.globalAlpha = strokeAlpha;
      ctx.lineWidth = Math.min(strokeSize, circleSize / 10);
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }

    // Reset global alpha.
    ctx.globalAlpha = 1.0;
  }

  // Convert hex string value to RGB.
  static hexToRgb (hex) {
    const hexStringLength = hex.length;
    let conversion = {},
      codeIsShort = false,
      result = {
        "blue": 0,
        "green": 0,
        "red": 0
      };

    // Detect whether the hex string is short (#FFF) or long (#FFFFFF).
    if (hexStringLength < 3) {
      console.error(`Color hex string ${hex} is invalid.`);
      return result;
    } else if (hexStringLength < 5) {
      codeIsShort = true;
      conversion = (/^#?(?<red>[a-f\d]{1})(?<green>[a-f\d]{1})(?<blue>[a-f\d]{1})$/iu).exec(hex);
    } else if (hexStringLength > 6) {
      codeIsShort = false;
      conversion = (/^#?(?<red>[a-f\d]{2})(?<green>[a-f\d]{2})(?<blue>[a-f\d]{2})$/iu).exec(hex);
    } else {
      console.error(`Color hex string ${hex} is invalid.`);
      return result;
    }

    // Convert hex to int.
    if (codeIsShort) {
      // Double up hex values on short codes.
      result = {
        "blue": `${conversion.groups.blue}${conversion.groups.blue}`,
        "green": `${conversion.groups.green}${conversion.groups.green}`,
        "red": `${conversion.groups.red}${conversion.groups.red}`
      };
    } else {
      result = {
        "blue": conversion.groups.blue,
        "green": conversion.groups.green,
        "red": conversion.groups.red
      };
    }

    // Convert the result.
    result = {
      "blue": parseInt(result.blue, 16),
      "green": parseInt(result.green, 16),
      "red": parseInt(result.red, 16)
    };

    return result;
  }

  // Convert an integer color code component to a hex value.
  static componentToHex (component) {
    const hex = component.toString(16);

    // If the component is a single-digit integer, its hex value needs a leading zero.
    if (hex.length === 1) {
      return `0${hex}`;
    }

    return hex;
  }

  // Convert a RGB color code to a long hex color code.
  static rgbToHex (red, green, blue) {
    return `#${Canvas.componentToHex(red)}${Canvas.componentToHex(green)}${Canvas.componentToHex(blue)}`.toUpperCase();
  }

  // Draw an image that scales with the zoom level.
  static drawImage (ctx, positionX, positionY, zoomScale, fillAlpha, sizeModifier, image, rotation = 0.0, useScreen = false) {
    // Convert degrees to radians.
    const radians = Canvas.degreesToRadians(rotation),
      // Set an effective minimum size for the shape.
      imageSize = Math.max(8, Canvas.calculateMinimumSize(sizeModifier * 100, zoomScale, sizeModifier)),
      origin = {
        "x": positionX - (imageSize / 2),
        "y": positionY - (imageSize / 2)
      };
      // fillColorRGB = Canvas.hexToRgb(fillColor);

    // Save the canvas context state.
    ctx.save();

    // Move the center of the image to the origin.
    ctx.translate(origin.x, origin.y);

    // Rotate the canvas around the origin.
    ctx.rotate(radians);

    // Define the image's appearance.
    ctx.globalAlpha = fillAlpha;
    // ctx.fillStyle = fillColor;

    // Screen the image if we choose to.
    if (useScreen) {
      ctx.globalCompositeOperation = "screen";
    }

    // Draw the image. Must be square; most EE object sprites are anyway.
    ctx.drawImage(image, 0, 0, imageSize, imageSize);

    // TODO: Blend a rect filled with fillColorRGB to tint the image. This is a requirement for using sprites for
    // faction-specific objects, especially ships and stations.
    //
    // The following doesn't work — it wipes the rest of the canvas rendered before this — and it's unclear why.
    //
    // ```
    // ctx.globalCompositeOperation = "source-in";
    //
    // // Draw the shape.
    // ctx.fillRect(0, 0, imageSize, imageSize);
    // ```
    //
    // Doing the rendering in a separate off-screen canvas didn't help.
    //
    // The alternatives are to rewrite the color of every pixel, which is ridiculously expensive, or to tint the
    // source files in a sprite sheet, which is a lot of work required for every game sprite.

    // Reset global alpha.
    ctx.globalAlpha = 1.0;

    // Restore the saved context state.
    ctx.restore();
  }

  // Draw the object's callsign.
  static drawCallsign (ctx, positionX, positionY, zoomScale, entry, fontSize, lowColor, highColor, textDrift) {
    // Callsign should be off center and to the side of the object.
    const textDriftAmount = Math.max((textDrift * 66.666) * zoomScale, textDrift);
    let callsignText = entry.callsign;

    // Draw the callsign above the object.
    ctx.fillStyle = Canvas.getFactionColor(entry.faction, lowColor, highColor);
    ctx.textAlign = "center";
    ctx.font = `${fontSize}px 'Big Shoulders', 'Bebas Neue Book', Impact, Arial, sans-serif`;

    // Call out PlayerSpaceships in callsigns
    if (entry.type === "PlayerSpaceship") {
      callsignText = `${callsignText} (Player)`;
    }

    ctx.fillText(callsignText, positionX, positionY - textDriftAmount);

    // Reset text alignment.
    ctx.textAlign = "left";
  }

  // Draw a station.
  drawStation(ctx, positionX, positionY, entry, overrideFillColor = "#FF00FF") {
    // Get its faction color.
    const highColorMagnitude = "FF", // eslint-disable-line
      lowColorMagnitude = "55";

    // Draw a shape and scale it by zoom and station type.
    let sizeModifier = 12,
      // Set a default faction color.
      factionColor = overrideFillColor;

    switch (entry.station_type) {
    case "Huge Station":
      sizeModifier = 27;
      break;
    case "Large Station":
      sizeModifier = 21;
      break;
    case "Medium Station":
      sizeModifier = 17;
      break;
    case "Small Station":
      sizeModifier = 12;
      break;
    default:
    }

    // Get the station's faction color, unless we're overriding the fill color.
    if (overrideFillColor === "#FF00FF") {
      factionColor = Canvas.getFactionColor(entry.faction, lowColorMagnitude, highColorMagnitude);
    } else {
      factionColor = overrideFillColor;
    }

    Canvas.drawHex(ctx, positionX, positionY, this._zoomScale, factionColor, 1.0, sizeModifier);

    // Draw the station's callsign, if callsigns are enabled.
    if (this.showCallsigns === true) {
      Canvas.drawCallsign(ctx, positionX, positionY, this._zoomScale, entry, "18", lowColorMagnitude, highColorMagnitude, 5 + (sizeModifier / Math.PI));
    }
  }

  // Draw a player or CPU ship.
  drawShip(ctx, positionX, positionY, entry, overrideFillColor = "#FF00FF") {
    // Initialize color brightness.
    const sizeModifier = 4;
    let highColorMagnitude = "CC",
      lowColorMagnitude = "66",
      // Set a default faction color.
      factionColor = overrideFillColor,
      // Assume we're not drawing on the hit canvas by default.
      drawingOnHitCanvas = false;

    // Use a brighter color for player ships.
    if (entry.type === "PlayerSpaceship") {
      highColorMagnitude = "FF";
      lowColorMagnitude = "80";
    }

    // Get the ship's faction color, unless we're overriding the fill color to draw on the hit canvas.
    if (overrideFillColor === "#FF00FF") {
      factionColor = Canvas.getFactionColor(entry.faction, lowColorMagnitude, highColorMagnitude);
    } else {
      drawingOnHitCanvas = true;
      factionColor = overrideFillColor;
    }

    // Draw shield arcs if the object has them. #4
    // For each segment in entry.shields.
    //  Divide a circle into equal sized arcs.
    //  Draw each arc at an alpha value relative to its current percentile strength.
    //  Max is in the entry.config.shields array.
    //
    // Draw hull strength bar. #4
    // For entry.hull.
    //  Draw the width at a value relative to its current percentile strength.
    //  Max is in entry.config.hull.

    // Draw beam arcs if the object has them and we're not drawing on the hit canvas.
    if ("config" in entry && "beams" in entry.config && !drawingOnHitCanvas) {
      for (let beamIndex = 0; beamIndex < entry.config.beams.length; beamIndex += 1) {
        const beam = entry.config.beams[beamIndex],
          arc = entry.rotation + beam.direction,
          range = beam.range * this._zoomScale,
          a1 = (arc - (beam.arc / 2.0)) / 180.0 * Math.PI,
          a2 = (arc + (beam.arc / 2.0)) / 180.0 * Math.PI,
          x1 = positionX + (Math.cos(a1) * range),
          y1 = positionY + (Math.sin(a1) * range),
          x2 = positionX + (Math.cos(a2) * range),
          y2 = positionY + (Math.sin(a2) * range);

        // Draw the arc.
        ctx.beginPath();
        ctx.moveTo(positionX, positionY);
        ctx.lineTo(x1, y1);
        ctx.arc(positionX, positionY, range, a1, a2, false);
        ctx.lineTo(x2, y2);
        ctx.lineTo(positionX, positionY);

        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Draw turret arcs.
        if (beam.turret_arc > 0) {
          const turret_arc = entry.rotation + beam.turret_direction,
            turret_a1 = (turret_arc - (beam.turret_arc / 2.0)) / 180.0 * Math.PI,
            turret_a2 = (turret_arc + (beam.turret_arc / 2.0)) / 180.0 * Math.PI,
            turret_x1 = positionX + (Math.cos(turret_a1) * range),
            turret_y1 = positionY + (Math.sin(turret_a1) * range),
            turret_x2 = positionX + (Math.cos(turret_a2) * range),
            turret_y2 = positionY + (Math.sin(turret_a2) * range);

          // Draw the arc.
          ctx.beginPath();
          ctx.moveTo(positionX, positionY);
          ctx.lineTo(turret_x1, turret_y1);
          ctx.arc(positionX, positionY, range, turret_a1, turret_a2, false);
          ctx.lineTo(turret_x2, turret_y2);
          ctx.lineTo(positionX, positionY);

          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = "#FF0000";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }
    }

    // Draw the shape and scale it on zoom.
    Canvas.drawShapeWithRotation("delta", ctx, positionX, positionY, this._zoomScale, factionColor, 1.0, sizeModifier, entry.rotation);

    // Draw its callsign. Draw player callsigns brighter.
    if (this.showCallsigns === true) {
      Canvas.drawCallsign(ctx, positionX, positionY, this._zoomScale, entry, "18", lowColorMagnitude, highColorMagnitude, 5);
    }
  }

  // Convert degrees to radians. Used for canvas rotation.
  static degreesToRadians (degrees) {
    return degrees * Math.PI / 180;
  }

  // Rotate a given shape before drawing it.
  static drawShapeWithRotation (shape, ctx, positionX, positionY, zoomScale, fillColor, fillAlpha, sizeModifier, rotation = 0.0) {
    // Convert degrees to radians.
    const radians = Canvas.degreesToRadians(rotation);

    // Save the canvas context state.
    ctx.save();

    // Move the center of the image to the origin.
    ctx.translate(positionX, positionY);

    // Rotate the canvas around the origin.
    ctx.rotate(radians);

    // Draw the given shape, or log that this method doesn't support it.
    switch (shape) {
    case "square":
      Canvas.drawSquare(ctx, 0, 0, zoomScale, fillColor, fillAlpha, sizeModifier);
      break;
    case "circle":
      Canvas.drawCircle(ctx, 0, 0, zoomScale, fillColor, fillAlpha, sizeModifier);
      break;
    case "delta":
      Canvas.drawDelta(ctx, 0, 0, zoomScale, fillColor, fillAlpha, sizeModifier);
      break;
    case "triangle":
      Canvas.drawTriangle(ctx, 0, 0, zoomScale, fillColor, fillAlpha, sizeModifier);
      break;
    default:
      console.error(`Shape ${shape} not supported.`);
    }

    // Restore the saved context state.
    ctx.restore();
  }
}
