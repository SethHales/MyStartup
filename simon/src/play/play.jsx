import React from 'react';
import "./play.css";

export function Play() {
  return (
    <main class="bg-secondary">
      <div class="players">
        Player
        <span class="player-name">Mystery player</span>
        <div id="player-messages">
          <div class="event"><span class="player-event">Linus</span> scored 377</div>
          <div class="event"><span class="player-event">Linus</span> started a new game</div>
          <div class="event"><span class="system-event">game</span> connected</div>
        </div>
      </div>

      <div class="game">
        <div class="button-container">
          <button class="button-top-left"></button>
          <button class="button-top-right"></button>
          <button class="button-bottom-left"></button>
          <button class="button-bottom-right"></button>
          <div class="controls center">
            <div class="game-name">Simon<sup>&reg;</sup></div>
            <div class="score center">--</div>
            <button class="btn btn-primary">Reset</button>
          </div>
        </div>
      </div>
    </main>
  );
}