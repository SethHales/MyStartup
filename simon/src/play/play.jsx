import React from 'react';
import './play.css';

export function Play() {
  return (
    <main className="bg-secondary">
      <div className="players">
        Player
        <span className="player-name">Mystery player</span>
        <div id="player-messages">
          <div className="event">
            <span className="player-event">Linus</span> scored 377
          </div>
          <div className="event">
            <span className="player-event">Linus</span> started a new game
          </div>
          <div className="event">
            <span className="system-event">game</span> connected
          </div>
        </div>
      </div>

      <div className="game">
        <div className="button-container">
          <button className="button-top-left"></button>
          <button className="button-top-right"></button>
          <button className="button-bottom-left"></button>
          <button className="button-bottom-right"></button>
          <div className="controls center">
            <div className="game-name">
              Simon<sup>&reg;</sup>
            </div>
            <div className="score center">--</div>
            <button className="btn btn-primary">Reset</button>
          </div>
        </div>
      </div>
    </main>
  );
}
