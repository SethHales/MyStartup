import React from 'react';
import './about.css';
import { getQuote } from '../service';

export function About() {
  const [quote, setQuote] = React.useState({text: '', author: ''})

  function updateQuote() {
    const quote = getQuote()
    setQuote(quote)
  }

  React.useEffect(() => {
    const quote = getQuote();
    setQuote(quote);
  }, [])

  

  return (
    <main className="container-fluid bg-secondary text-center">
      <div>
        <div id="picture" className="picture-box">
          <img src="placeholder.jpg" alt="random" />
        </div>

        <p>Simon is a repetitive memory game where you follow the demonstrated color sequence until you make a mistake. The longer the sequence you repeat, the greater your score.</p>

        <p>The name Simon is a registered trademark of Milton-Bradley. Our use of the name and the game is for non-profit educational use only. No part of this code or program should be used outside of that definition.</p>

        <div id="quote" className="quote-box bg-light text-dark" onClick={updateQuote}>
          <p className="quote">{quote.text}</p>
          <p className="author">{quote.author}</p>
        </div>
      </div>
    </main>
  );
}
