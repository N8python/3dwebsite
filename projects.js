const projects = {
    "3D": [{
        title: "Dual Duel",
        image: "dualDuel.png",
        link: "https://n8python.github.io/dualDuel/",
        description: "An exciting first-person shooter with fun sword combat. 10 Levels, Unique Enemies (Models from other People), Epic Weapons (Models from other People), play now! Built with enable3d, with some of the models/animations from mixamo.com and clara.io"
    }, {
        title: "Village Sandbox",
        image: "villageSandbox.png",
        link: "https://n8python.github.io/villageSandbox/",
        description: "An uncompleted indie game that's about building a village of robots on a prehistoric island. The plot makes no sense, but the game is pretty good. It has some basic gameplay, some battles, and elementary tech tree, and all sorts of other fun stuff!"
    }, {
        title: "Zappers",
        image: "zappers.png",
        link: "https://n8python.github.io/zappers/",
        description: "A fun arcade-style shoot em up with beautiful graphics that rival those of the PS 1. Take control of your ship (in first person cuz third person math is hard), and blast down others in a competition to get the most points. The ships also fight each other. That's cool, I guess."
    }, {
        title: "Procedural Terrain",
        image: "proceduralWorld.png",
        link: "https://n8python.github.io/proceduralWorld/",
        description: "A relatively efficient chunk-based infinite world. Thought I could make it into a game. Lost motivation. So the procedural terrain has items, combat, and purple guys. Have fun!"
    }],
    "AI": [{
        title: "Cat Creator",
        image: "catCreator.png",
        link: "https://n8python.github.io/catCreator/",
        description: "A convolutional autoencoder trained on cats... sliders to modify the latent space... you can make tons of CUSTOM CATS! Use the sliders in this app to create any cat you could possibly *imagine! *if that cats that you imagine are all 64x64 pixels and very blurry."
    }, {
        title: "MNIST Latent Space",
        image: "mnistLatentSpace.png",
        link: "https://n8python.github.io/mnistLatentSpace/",
        description: "Explore the wonderful world of the MNIST latent space. The MNIST dataset is an open-source colllection of 60,000 numbers. I trained a neural network on the dataset, and then by using what it learned, you can explore the space 'in between' different numbers. It's sort of hard to explain - just click on this experiment and you'll see. The 'in between' space is also kinda blurry cause I didn't use a variational autoencoder."
    }, {
        title: "MNIST Classifier",
        image: "mnistClassifier.png",
        link: "https://n8python.github.io/mnistClassifier/",
        description: "Draw a digit and a convnet will classify it. It's that simple."
    }, {
        title: "Sentiment Analysis AI",
        image: "sentimentLSTM.png",
        link: "https://sentiments-lstm.herokuapp.com/",
        description: "This LSTM was trained on a dataset of hundreds of thousands of tweets (Sentiment140 Dataset). From these tweets, it learned to detect sentiment and tone of short messages. The LSTM will give a number between -1 (very negative) and 1 (very positive). Go try it out now!"
    }, {
        title: "Chess AI",
        image: "chessAI.png",
        link: "https://n8python.github.io/lil-chess/",
        description: "This chess AI uses minimax and material evaluation with piece tables to choose moves. Enjoy a beautiful-ish GUI and an intuitive dashboard. Test your skill against this amazing AI that plays at the level of a third grader! (En Passant isn't and will never be implemented)"
    }, {
        title: "Music AI",
        image: "musicAI.jpeg",
        link: "https://www.youtube.com/watch?v=sIwHcSgpN7o&t=23s",
        description: "This video documents a competition between myself and a friend to create a music-generating AI. It went... well. The music was ok, sometimes almost pleasant. Check the video out now! (Ignore the cringe skit in the beginning)"
    }, {
        title: "Text Generation with LSTMs",
        image: "lstmGeneration.jpeg",
        link: "https://www.youtube.com/watch?v=gB69c7FSZro",
        description: "Another video - about using an LSTM to generate text - not music. And writing Shakespeare fanfiction. Watch now. Please I need views. If you want a better documentation of all the weird results I got - check out this article."
    }, {
        title: "Walking AI",
        image: "walkingAI.png",
        link: "https://n8python.github.io/walkingAI/",
        description: "These AIs... might kinda learn to walk. They use my botched implementation of NEAT for evolution (read my article on that here), and might end up hobbling along."
    }, {
        title: "Snake AI",
        image: "snakeAI.png",
        link: "https://n8python.github.io/snakeai/",
        description: "Snakes learn to play... snake. Using a basic genetic algorithm. Did this project as an introduction to AI."
    }],
    "Cool": [{
        title: "Apollo X",
        image: "apolloX.png",
        link: "https://n8python.github.io/apolloX/",
        description: "A singleplayer ragdoll combat game. Explore the wonders of space as you duel with unique enemies, using unique weapons, on 10 unique levels. And this time - the unique enemies and weapons weren't taken from other people!"
    }, {
        title: "Boomba Zoomba",
        image: "boombaZoomba.png",
        link: "https://boomba-zoomba.herokuapp.com/",
        description: "Become the ultimate warrior by commandeering a ragdoll to beat up other ragdolls. Enjoy singleplayer & multiplayer modes - and unlock all sorts of fun and weird custom hats. I spent so much time on those hats."
    }, {
        title: "Z Language",
        image: "zLang.png",
        link: "https://zlanguage.github.io/",
        description: "This is a full-feautured programming language that transpiles to JavaScript. It dosen't have many practical uses, and is no longer actively maintained. It was a pet project of mine, but I worked on it for four months, so I might as well put it here."
    }, {
        title: "Germ City",
        image: "germCity.png",
        link: "https://n8python.github.io/germCity/",
        description: "Behold - the most advanced person-to-person epidemic simulation on this side of the mississippi (*not technically correct)! Think of an epidemic simulator, but with an actual city, more advanced AI, jobs, schools, hospitals... the list goes on! Try to prevent a deadly disease from spreading - but be careful, as you must balance your budget. (Note, this game is not fully completed, nor will it ever be. It will not save your progress)."
    }, {
        title: "Potatoz",
        image: "potatoz.png",
        link: "https://n8python.github.io/potatoz2/",
        description: "This incremental clicker I made got a bit of attention and recieved over 20,000 views online (weird flex but ok). Play now, and start the potatopocalypse. Not a Universal Paperclips ripoff. It was merely *inspired* by that amazing incremental."
    }, {
        title: "Photonic",
        image: "photonic.png",
        link: "https://n8python.github.io/Photonic/",
        description: "This is a single-player game where you can explore a procedurally generated world with a single torch. Has block breaking, placing, and even crafting. And no, it was totally not in any way inspired by Minecraft. There is no objective, and this is more of a test than a true game. Do not expect any updates in the future."
    }, {
        title: "Covid Dashboard",
        image: "covidDashboard.png",
        link: "https://n8python.github.io/covid19dashboard/",
        description: "Like so many people, I decided to make a coronavirus dashboard. But I added some cool features (map replays, projections, and more!) - so check it out!"
    }, {
        title: "Gear Grappler",
        image: "gearGrappler.png",
        link: "https://n8python.github.io/gearGrappler/",
        description: "Swing from gear to gear, experiencing the rush and thrill of neon graphics and juicy sound effects (from freesound.com). This is a small game, but its' fun, relaxing, and worth a quick play. Also has four unique characters: all of whom are just different color squares."
    }],
    "Old": [{
        title: "Old Potatoz",
        image: "potatoz.png",
        link: "https://n8python.github.io/potatoz/",
        description: "The older version of potatoz that was more of a way to learn about the DOM than a legit attempt at a game. Literally takes 5 minutes to play."
    }, {
        title: "Swordster.io",
        image: "swordsterio.png",
        link: "https://n8python.github.io/swordster.io/",
        description: "I was playing a lot of .io, and thought: what if I made a game with .io in the title? Hence this was born. I didn't understand that io games have to have (fake) multiplayer, so enjoy this somewhat decent, very short, dungeon crawler."
    }, {
        title: "My Eye Camp",
        image: "myeye.png",
        link: "https://n8python.github.io/my-eye/",
        description: "An application where you can exercise your eyes. It's as interesting as it sounds."
    }, {
        title: "Mini Galaga",
        image: "miniGalaga.png",
        link: "https://n8python.github.io/mini-galaga/",
        description: "Some kind of galaga fan game. Was fun to make and is a nice little shoot-em-up."
    }, {
        title: "Menorah Man",
        image: "menorahMan.png",
        link: "https://n8python.github.io/menorah-man/",
        description: "My attempt at making a Hanukkah game. Has mildly passable pixel art and repetitive gameplay. Light the candles with menorahs (yes the MENORAH lights the CANDLES) and enjoy Hannukah... Hanukkah? Chanukkah? Chanukah?"
    }, {
        title: "Eternal Void",
        image: "eternalVoid.png",
        link: "https://n8python.github.io/eternal-void/",
        description: "This is the first real JavaScript game I ever made. Pretty cool for a first project. Janky controls, vector art (cuz I didn't know how to import images), and meteors that look like cookies. Play now!"
    }]
}