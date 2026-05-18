<!DOCTYPE html>
<html lang="us">

  <head>
    <meta charset="utf-8">
    <title>EmptyEpsilon game state log viewer</title>
    <!-- CSS for buttons, sliders, faction colors -->
    <link href="style.css" rel="stylesheet">
    <link rel="preload" href="fonts/BigShoulders/BigShouldersText-VariableFont_wght.ttf" as="font" type="font/ttf">
    <!-- jQuery as used by the original index.html -->
    <script src="js/jquery.min.js"></script>
    <!-- Mousetrap to handle keyboard shortcuts -->
    <script src="js/mousetrap.min.js"></script>
    <!-- Alea RNG for random nebula and wormhole images -->
    <script src="js/alea.min.js"></script>
    <!-- Log viewer classes -->
    <script src="js/logData.js"></script>
    <script src="js/canvas.js"></script>
    <!-- Lua parser and dAST walker scripts -->
    <script src="js/luaparse.js"></script>
    <script src="js/walker.js"></script>

  </head>

  <?php
    $default_log_file = __DIR__ . '/default_logfile.txt';
    if (file_exists($default_log_file)) {
        $log_content = file_get_contents($default_log_file);
        // Embed the log content in a script tag with a custom type. This is more robust
        // than creating a JavaScript string literal, which can have escaping issues.
        echo '<script id="default-log-data" type="text/plain">' . htmlspecialchars($log_content, ENT_NOQUOTES, 'UTF-8') . '</script>';
    }

    $annotations_file = __DIR__ . '/annotations.json';
    if (file_exists($annotations_file)) {
        $annotations_content = file_get_contents($annotations_file);
        echo '<script id="default-annotations-data" type="text/plain">' . htmlspecialchars($annotations_content, ENT_NOQUOTES, 'UTF-8') . '</script>';
    }
  ?>

  <body>
    <!-- Canvases; bg for grid and terrain, fg for objects. Hitbox is drawn in-script. -->
    <canvas id="canvas-bg"></canvas>
    <canvas id="canvas-fg"></canvas>
    <svg id="token-overlay"></svg>

    <!-- Playback controls -->
    <div id="controls">
      <button class="ee-button" id="autoplay">Play</button>
      <button class="ee-button" id="autoplay_speed">10x</button>
      <input class="ee-slider" id="time_selector" type="range" min="0" max="0" value="0">
      <button class="ee-button" id="callsigns">Callsigns</button>
    </div>

    <!-- View navigation -->
    <input id="zoom_selector" type="range" min="2" max="150">
    <button class="ee-button" id="zoom_in">+</button>
    <button class="ee-button" id="zoom_out">-</button>
    <button class="ee-button" id="lock_view">d</button>

    <!-- Editing tools -->
    <div id="tools">
      <button class="ee-button tool-button active" data-tool="pan" title="Pan/Select (P)">✋</button>
      <button class="ee-button tool-button" data-tool="add_token" title="Add Token (T)">★</button>
      <button class="ee-button tool-button" data-tool="draw" title="Draw (R)">✏️</button>
      <button class="ee-button" id="undo_drawing" title="Undo (Ctrl+Z)">↩</button>
      <button class="ee-button tool-button" data-tool="delete" title="Delete (Del/Backspace)">🗑️</button>
      <button class="ee-button" id="save_annotations" title="Save Annotations (Ctrl+S)">💾</button>
      <div id="draw-options">
        <div class="color-row">
            <div class="color-swatch active" data-color="#2563eb" style="background:#2563eb"></div>
            <div class="color-swatch" data-color="#dc2626" style="background:#dc2626"></div>
            <div class="color-swatch" data-color="#16a34a" style="background:#16a34a"></div>
            <div class="color-swatch" data-color="#ca8a04" style="background:#ca8a04"></div>
            <div class="color-swatch" data-color="#ea580c" style="background:#ea580c"></div>
            <div class="color-swatch" data-color="#ffffff" style="background:#ffffff"></div>
        </div>
        <div class="brush-row">
            <input type="range" id="brush-size" min="20" max="500" value="100" class="ee-slider">
        </div>
      </div>
    </div>

    <!-- Selection infobox -->
    <div id="infobox">
      <div id="infobox-scroll-container">
        <table id="infobox-content"></table>
      </div>
    </div>

    <!-- Content loading screen -->
    <div class="ee-box" id="dropzone">
      <p id="droptarget">Drop log file here</p>
      <input id="filepicker" type="file">
    </div>

    <!-- factionInfo.lua loader and parser -->
    <script src="js/factionloader.js"></script>
    <!-- Log loading and canvas drawing script -->
    <script src="js/gamestatelog.js"></script>

  </body>

</html>
