import React from 'react';
import "./about.css";

export function About() {
  return (
    <main class="container-fluid bg-secondary text-center">
      <div>
        <div id="picture" class="picture-box"><img src="placeholder.jpg" alt="random" /></div>

        <p>
          Simon is a repetitive memory game where you follow the demonstrated color sequence until you make a mistake.
          The longer the sequence you repeat, the greater your score.
        </p>

        <p>
          The name Simon is a registered trademark of Milton-Bradley. Our use of the name and the game is for non-profit
          educational use only. No part of this code or program should be used outside of that definition.
        </p>

        <div id="quote" class="quote-box bg-light text-dark">
          <p class="quote">Words are cheap. Show me the code.</p>
          <p class="author">Linus Torvalds</p>
        </div>
      </div>
    </main>
  );
}