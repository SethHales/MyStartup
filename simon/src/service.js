const quotes = [
    {text: "Blah", author: "Steven"},
    {text: "Hi", author: "A"},
    {text: "Hello World", author: "Computer"},
]

export function getQuote() {
    const randomIndex = Math.floor(Math.random()*quotes.length)
    return quotes[randomIndex]
}

export function registerUser(email, password) {
    console.log(`Registering with: ${email} and ${password}`)

    const users = JSON.parse(localStorage.getItem('users') || "[]");
    
    users.push({email, password});
    localStorage.setItem('users', JSON.stringify(users))
}