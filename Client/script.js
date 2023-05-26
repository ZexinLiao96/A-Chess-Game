let username;
let gameId;
let side;
let myTurn;
let selectedPiece = null;
let highlightedCells = [];
let gameProceeding = false;
let lastOpponentMove = null;

window.addEventListener("load", function () {
    const findMatchButton = document.querySelector("#findMatchButton");
    const quitButton = document.querySelector("#quitButton");

    findMatchButton.addEventListener("click", async function () {
        try {
            username = await getUsername();
        } catch (error) {
            window.alert(error);
            return;
        }
        displayUsername();
        findMatchButton.disabled = true;
        quitButton.disabled = false;
        try {
            await findMatch();
        } catch (error) {
            window.alert(error);
        }
    });

    quitButton.addEventListener("click", async function () {
        await quitGame();
        findMatchButton.disabled = false;
        quitButton.disabled = true;
    });
});

async function getUsername() {
    try {
        const response = await fetch('http://127.0.0.1:8080/register', {
            method: 'GET',
        });
        return await response.text();
    } catch (error) {
        throw error;
    }
}

function displayUsername() {
    const usernameContainer = document.querySelector("#usernameContainer");
    usernameContainer.value = username;
}

async function findMatch() {
    const signal = document.querySelector("#signal");
    const status = document.querySelector("#status");
    status.innerHTML = 'Pairing, please wait...';

    //try to pair every 1 sec.
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`http://127.0.0.1:8080/pairme?player=${username}`, {
                method: 'GET',
            });
            const data = await response.json();

            if (data.gameState === 'progress') {
                gameProceeding = true;
                clearInterval(intervalId);
                gameId = data.gameID;

                if (username === data.player1) {
                    side = "white";
                    myTurn = true;
                    status.innerHTML = `You are playing against ${data.player2}, Good Luck!`;
                    signal.innerHTML = 'Your Turn';
                    signal.style.backgroundColor = 'green';
                } else {
                    side = "black";
                    myTurn = false;
                    status.innerHTML = `You are playing against ${data.player1}, Good Luck!`
                    signal.innerHTML = 'Opponent Turn';
                    signal.style.backgroundColor = 'red';
                    pollForTheirMove(username, gameId);
                }
                prepareGame();
            }
        } catch (error) {
            console.error(error);
        }
    }, 1000);
}

function prepareGame() {
    let pieces;
    if (side === "white") {
        pieces = document.querySelectorAll('img[alt^="white"]');
    } else {
        pieces = document.querySelectorAll('img[alt^="black"]');
    }

    pieces.forEach(function (piece) {
        let pieceType = piece.alt.split(' ')[1];
        piece.addEventListener('click', function (event) {
            clickPiece(pieceType, event);
        });
    })
}

function clickPiece(pieceType, event) {
    if (myTurn) {
        //allow switching target before make move
        checkTarget(event);

        // Select the new piece
        selectedPiece = event.target;
        selectedPiece.style.boxShadow = '0 0 10px 5px yellow';

        // Get the cell containing the piece
        const cell = selectedPiece.parentElement;
        const cellId = cell.id;
        const cellColumn = cellId[0];
        const cellRow = parseInt(cellId[1]);

        const allowedCells = getAllowedCells(pieceType, cellColumn, cellRow);
        allowedCells.forEach(function (allowedCell) {
            allowedCell.style.backgroundColor = 'green';
            allowedCell.addEventListener('click', movePiece);
            highlightedCells.push(allowedCell);
        })
    }
}

function checkTarget(event) {
    if (selectedPiece && selectedPiece !== event.target) {
        selectedPiece.style.boxShadow = '';
        highlightedCells.forEach(function (cell) {
            cell.style.backgroundColor = '';
            cell.removeEventListener('click', movePiece);
        });
    }
}

function getAllowedCells(pieceType, cellColumn, cellRow) {
    let allowedCells = [];

    switch (pieceType) {
        case 'pawn': {
            // Calculate the id of the cells in front of the pawn
            const frontCellId = cellColumn + (cellRow + (side === 'white' ? 1 : -1));
            const frontTwoCellsId = cellColumn + (cellRow + (side === 'white' ? 2 : -2));
            const leftCellId = String.fromCharCode(cellColumn.charCodeAt(0) - 1) + (cellRow + (side === 'white' ? 1 : -1));
            const rightCellId = String.fromCharCode(cellColumn.charCodeAt(0) + 1) + (cellRow + (side === 'white' ? 1 : -1));

            // Get the cells by their id
            const frontCell = document.getElementById(frontCellId);
            const frontTwoCells = document.getElementById(frontTwoCellsId);
            const leftCell = document.getElementById(leftCellId);
            const rightCell = document.getElementById(rightCellId);

            // If the front cell is empty, the pawn can move to it
            if (frontCell && frontCell.childElementCount === 0) {
                allowedCells.push(frontCell);

                // If the pawn is at its starting position and the two cells in front are empty, it can also move two cells forward
                if ((cellRow === 2 && side === 'white' || cellRow === 7 && side === 'black') && frontTwoCells && frontTwoCells.childElementCount === 0) {
                    allowedCells.push(frontTwoCells);
                }
            }

            // If the left or right cell contains an enemy piece, the pawn can move to it
            [leftCell, rightCell].forEach(function (sideCell) {
                if (sideCell && sideCell.childElementCount === 1 && sideCell.children[0].getAttribute('alt').includes(side === 'white' ? 'black' : 'white')) {
                    allowedCells.push(sideCell);
                }
            });
        }
            break;
        case 'rook' : {
            let thisCell;
            for (let i = cellRow + 1; i <= 8; i++) {
                thisCell = document.getElementById(`${cellColumn}${i}`);
                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    break;
                } else {
                    allowedCells.push(thisCell);
                    break;
                }
            }
            for (let i = cellRow - 1; i >= 1; i--) {
                thisCell = document.getElementById(`${cellColumn}${i}`);
                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    break;
                } else {
                    allowedCells.push(thisCell);
                    break;
                }
            }
            for (let i = cellColumn.charCodeAt(0) - 1; i >= 65; i--) {
                thisCell = document.getElementById(`${String.fromCharCode(i)}${cellRow}`);
                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    break;
                } else {
                    allowedCells.push(thisCell);
                    break;
                }
            }
            for (let i = cellColumn.charCodeAt(0) + 1; i <= 72; i++) {
                thisCell = document.getElementById(`${String.fromCharCode(i)}${cellRow}`);
                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    break;
                } else {
                    allowedCells.push(thisCell);
                    break;
                }
            }
        }
            break;
        case 'knight' : {
            let thisCell;
            let dx = [2, 1, -1, -2, -2, -1, 1, 2];
            let dy = [1, 2, 2, 1, -1, -2, -2, -1];

            for (let direction = 0; direction < 8; direction++) {
                let newRow = cellRow + dx[direction];
                let newColumn = String.fromCharCode(cellColumn.charCodeAt(0) + dy[direction]);

                thisCell = document.getElementById(`${newColumn}${newRow}`);

                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell && !thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    allowedCells.push(thisCell);
                }
            }
        }
            break;
        case 'bishop': {
            let thisCell;

            let dx = [-1, 1, -1, 1];
            let dy = [-1, 1, 1, -1];

            for (let direction = 0; direction < 4; direction++) {
                for (let distance = 1; distance <= 8; distance++) {
                    let newRow = cellRow + dx[direction] * distance;
                    let newColumn = String.fromCharCode(cellColumn.charCodeAt(0) + dy[direction] * distance);

                    thisCell = document.getElementById(`${newColumn}${newRow}`);

                    if (thisCell && thisCell.childElementCount === 0) {
                        allowedCells.push(thisCell);
                    } else if (thisCell) {
                        if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                            break;
                        } else {
                            allowedCells.push(thisCell);
                            break;
                        }
                    }
                }
            }
        }
            break;
        case 'queen': {
            let thisCell;

            let dx = [-1, 1, 0, 0, -1, 1, -1, 1];
            let dy = [0, 0, -1, 1, -1, 1, 1, -1];

            for (let direction = 0; direction < 8; direction++) {
                for (let distance = 1; distance <= 8; distance++) {
                    let newRow = cellRow + dx[direction] * distance;
                    let newColumn = String.fromCharCode(cellColumn.charCodeAt(0) + dy[direction] * distance);

                    thisCell = document.getElementById(`${newColumn}${newRow}`);

                    if (thisCell && thisCell.childElementCount === 0) {
                        allowedCells.push(thisCell);
                    } else if (thisCell) {
                        if (thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                            break;
                        } else {
                            allowedCells.push(thisCell);
                            break;
                        }
                    }
                }
            }

        }
            break;
        case 'king': {
            let thisCell;

            let dx = [-1, 1, 0, 0, -1, 1, -1, 1];
            let dy = [0, 0, -1, 1, -1, 1, 1, -1];

            for (let direction = 0; direction < 8; direction++) {
                let newRow = cellRow + dx[direction];
                let newColumn = String.fromCharCode(cellColumn.charCodeAt(0) + dy[direction]);

                thisCell = document.getElementById(`${newColumn}${newRow}`);

                if (thisCell && thisCell.childElementCount === 0) {
                    allowedCells.push(thisCell);
                } else if (thisCell && !thisCell.children[0].getAttribute('alt').includes(side === 'white' ? 'white' : 'black')) {
                    allowedCells.push(thisCell);
                }
            }
        }
            break;
    }

    return allowedCells;
}

async function movePiece(event) {
    const selectedCell = selectedPiece.parentElement;
    const selectedCellId = selectedCell.id;
    const selectedCellColumn = selectedCellId[0];
    const selectedCellRow = parseInt(selectedCellId[1]);

    const targetCell = event.currentTarget;
    const targetCellId = targetCell.id;
    const targetCellColumn = targetCellId[0];
    const targetCellRow = parseInt(targetCellId[1]);

    // If the cell contains an enemy piece, remove it
    if (targetCell.childElementCount === 1) {
        targetCell.removeChild(targetCell.children[0]);
    }

    // Move the piece to the new cell
    targetCell.appendChild(selectedPiece);

    // Deselect the piece and un-highlight the allowed cells
    selectedPiece.style.boxShadow = '';
    selectedPiece = null;

    highlightedCells.forEach(function (cell) {
        cell.style.backgroundColor = '';
        cell.removeEventListener('click', movePiece);
    });
    highlightedCells = [];

    myTurn = false;
    const signal = document.querySelector("#signal");
    signal.innerHTML = 'Opponent Turn';
    signal.style.backgroundColor = 'red';

    const move = `${selectedCellColumn}${selectedCellRow}-${targetCellColumn}${targetCellRow}`;
    await sendMyMove(username, gameId, move);
    pollForTheirMove(username, gameId);
}

async function sendMyMove(username, gameId, move) {
    try {
        await fetch(`http://127.0.0.1:8080/mymove?player=${username}&id=${gameId}&move=${move}`, {
            method: 'GET',
        });
    } catch (error) {
        window.alert(error);
    }
}

function pollForTheirMove(username, gameId) {
    const intervalId = setInterval(async () => {
        if (gameProceeding === false) {
            clearInterval(intervalId);
            return;
        }
        const theirMove = await getTheirMove(username, gameId);
        if (theirMove) {
            if (theirMove !== "terminate") {
                clearInterval(intervalId);
                const {from, to} = theirMove;
                const pieceMoved = document.getElementById(from).children[0];
                const cellToGo = document.getElementById(to);
                if (cellToGo.childElementCount === 1) {
                    cellToGo.removeChild(cellToGo.children[0]);
                }
                cellToGo.appendChild(pieceMoved);

                myTurn = true;
                const signal = document.querySelector("#signal");
                signal.innerHTML = 'Your Turn';
                signal.style.backgroundColor = 'green';
            } else {
                clearInterval(intervalId);
                const signal = document.querySelector("#signal");
                signal.innerHTML = 'You Win!';
                signal.style.backgroundColor = 'yellow';
            }
        }
    }, 1000);
}

async function getTheirMove(username, gameId) {
    try {
        const response = await fetch(`http://127.0.0.1:8080/theirmove?player=${username}&id=${gameId}`, {
            method: 'GET',
        });
        const data = await response.text();
        if (data.length === 0 || data === lastOpponentMove) {
            console.log("Opponent has not moved since last move");
            return null;
        } else if (data === "You Win") {
            return "terminate";
        } else {
            lastOpponentMove = data;
            const [from, to] = data.split('-');
            return {from, to};
        }
    } catch (error) {
        window.alert(error);
    }
}

async function quitGame() {
    try {
        const response = await fetch(`http://127.0.0.1:8080/quit?player=${username}&id=${gameId}`, {
            method: 'GET',
        });
        // check if response status is not OK
        if (!response.ok) {
            window.alert(response.status);
        } else {
            gameProceeding = false;
            const signal = document.querySelector("#signal");
            signal.innerHTML = 'You Lose!';
            signal.style.backgroundColor = 'white';
        }
    } catch (error) {
        throw error;
    }
}