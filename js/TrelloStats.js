/*
 * TrelloStats
 *
 * A pomodoro statistics generator for Trello
 *
 * Author:    Andreas Røssland <andreas@roessland.com>
 *
 * Live demo: http://roessland.com/trello-pomodoro-stats
 *
 * Source:    https://github.com/andross/trello-pomodoro-stats
 *
 */

var TrelloStats = {

    /*
     * Initalizes config and does stuff
     *
     * Connects to Trello API and initalizes events
     *
     */
    init: function(config) {
        var self = this;

        this.config = {};
        $.extend(this.config, config);

        Trello.authorize({
            interactive:false,
            success: self.onAuthorize
        });

        // Initialize events
        this.events();
    },

    /*
     * This function initializes events for the page.
     *
     * #connect-link: connect to Trello
     * #disconnect: log out
     * #board-list #board-list-select: get lists for board
     * #list-list #list-list-select: analyze selected list
     *
     */
    events: function() {
        var self = this
            dropZone = self.config.dropZone;

        // When connect-element is clicked,
        // login using Trello API popup
        $("#connect-link").click( function() {
            Trello.authorize({
                type: "popup",
                success: self.onAuthorize
            })
        });

        // When clicking disconnect-element,
        // log out from the Trello API
        $("#disconnect").on("click", self.logout);

        // When a board is selected,
        // show the help for importing the board
        $("#board-list").on("change", "#board-list-select", function(e) {
            var selected = $(this).find("option:selected"),
                board_id = selected.attr("id"),
                board_name = selected.html();
                board_url = selected.data("url");


            // Get list list for board
            self.config.openSelectedList[0].href = board_url + "/profile";
            self.config.selectedListName.text(board_name);
            self.config.upload.show(); 
        });

        dropZone[0].addEventListener('dragover', self.handleDragOver, false);
        dropZone[0].addEventListener('drop', self.handleFileDrop, false);
        },

    /*
     * Updates or hides the logged-in status, by toggling two divs
     *
     */
    updateLoggedIn: function() {
        var isLoggedIn = Trello.authorized();
        $("#loggedout").toggle(!isLoggedIn);
        $("#loggedin").toggle(isLoggedIn);        
    },

    /*
     * Runs when authorized by Trello API.
     *
     * Updates login status, gets user name, and gets user boards 
     *
     */
    onAuthorize: function() {
        var self = TrelloStats;

        self.updateLoggedIn();
        self.getName();
        self.getBoards();

    },

    /*
     * Gets the full name of the user, and puts it in a container 
     *
     */
    getName: function() {
        Trello.members.get("me", function(member){
            $("#user-fullname").text(member.fullName);
        });
    },

    /*
     * Gets the boards for a user, and prints a <select>-form in the
     * boardList container from the config.
     *
     */
    getBoards: function() {
        var self = this;

        // Add loading text
        $("<div>")
            .text("Loading boards...")
            .appendTo(self.config.boardList);

        // Get the list of boards this user has, and put it in a select list
        Trello.get("members/me/boards", function( boards ) {
            var tmpl_source = self.config.boardListTmpl.html();  // Get template
                tmpl = Handlebars.compile(tmpl_source);  // Compile template
            self.config.boardList.html( tmpl( {boards: boards} ) );  // Render template
        });

    },

    /*
     * Logs the user out using the Trello API, and updates the logged-in status
     *
     */
    logout: function() {
        Trello.deauthorize();
        TrelloStats.updateLoggedIn();
    },

    /*
     * When a file is dropped, parse the event data to get the JSON object for the board
     * Only the first file is parsed. The rest is ignored.
     */
    handleFileDrop: function( evt ) {
        var self = TrelloStats;
        evt.stopPropagation();
        evt.preventDefault();

        var files = evt.dataTransfer.files; // FileList object.
        var file = files[0];
        var reader = new FileReader();

        // Create a closure for reading the file data
        reader.onload = (function (theFile) {
            return function(e) {
                // Reads the file data
                var board = $.parseJSON( e.target.result );
                self.parseBoard( board );
                // board.actions.0.data.text;
            };
        })( file );


        // Read the first dropped file
        reader.readAsText( file );
    },

    /* 
     * Handle drag events
     *
     */
    handleDragOver: function( evt ) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    },

    getCard: function( board, card_id ) {
        for (var card in board.cards) {
            if (card_id == card.id) {
                return card;
            }
        }
    },

    /*
     * Parse board object for data
     *
     */
    parseBoard: function( board ) {
        var self = this;
        
        // Add pomodoro actions to their cards in the board variable
        $.grep( board.actions, function( action ) {
            // See if it is a pomodoro action
            if (action.type == "commentCard"
                && action.data.text.substr(0, 10) == "Pomodoro #") {

                // Get the pomodoroNumber after #
                var pomodoroNumber = parseInt(action.data.text.substr(10, 12));

                // add pomodoronumber to action
                action.pomodoroNumber = pomodoroNumber;

                // Get its card
                for (var i = 0; i < board.cards.length; i++) {
                    // Add the action to that card
                    if (board.cards[i].id == action.data.card.id) {
                        // Check if pomodoros list exist
                        if (board.cards[i].pomodoros == undefined) {
                            // Create list if it doesn't.
                            board.cards[i].pomodoros = []

                            // Since the first action in this list is the last pomodoro
                            // done, use this as the pomodoroAmount for this card
                            board.cards[i].pomodoroAmount = pomodoroNumber;
                        }
                        // Append action to list
                        board.cards[i].pomodoros.push( action );
                        
                        break;
                    }
                }
           }
        });

        self.Stats.init();

        // Pass each pomodoro card to the Stats object.
        for (var i = 0; i < board.cards.length; i++) {
            if (board.cards[i].pomodoroAmount != undefined) {
                self.Stats.update( board.cards[i] );
            }
        }

        console.log("Parsed board: ", board);

        // Render results
        $.get("results.tmpl.html", function( template_source ) {
                self.renderResults( template_source, { board: board, stats: self.Stats.get() } );
        });
    },

    renderResults: function( template_source, variables ) {
        self = TrelloStats;
        var template = Handlebars.compile(template_source);
        self.config.results.html( template(variables ));
    },

    Stats: {
        init: function( board ) {
            this.board = board;
            this.PomodoroAmount.init();
            this.WeekdaysAndHours.init();
        },
        update: function( card ) {
            this.PomodoroAmount.update( card );
            this.WeekdaysAndHours.update( card );
        },

        get: function() {
            return {
                pomodoroAmount: this.PomodoroAmount.get(),
                weekdays: this.WeekdaysAndHours.getWeekdays(),
                hours: this.WeekdaysAndHours.getHours(),
                daysHours: this.WeekdaysAndHours.getDaysHours()
            }
        },
        
        // Get the total amount of pomodoros on this board
        PomodoroAmount: {
            init: function() { this.pomodoroAmount = 0; },
            update: function( card ) { this.pomodoroAmount += card.pomodoroAmount; },
            get: function() { return this.pomodoroAmount; }
        },

        // Returns the amount of pomodoros per weekday
        // Output: [0, 1, 2, 0, 0, 0, 0] means one on tuesday and two on wednesday.
        WeekdaysAndHours: {
            init: function() { 
                this.weekdays = {
                    pomodoros: [0,0,0,0,0,0,0],
                    names: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                };

                this.hours = {
                    pomodoros: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                    names: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]
                };

                this.week = [];
                // Initalize
                for (var dayNumber = 0; dayNumber < 7; dayNumber++) {
                    this.week[dayNumber] = [];
                    for (var hourNumber = 0; hourNumber < 24; hourNumber++) {
                        this.week[dayNumber][hourNumber] = 0;
                    }
                }

            },
            update: function( card ) {
                this.previousNumber = 0; 
                for (var i = card.pomodoros.length - 1; i >= 0; i--) {
                    // Get number of the comments weekday by Date()-ing the JSON date.
                    var date = new Date(card.pomodoros[i].date),
                        // Get weekday as a number from 0 to 6.
                        day = date.getDay() - 1,
                        // Get hour as number from 0 to 23
                        hour = date.getHours();

                    // getDay uses 0 for Sunday. I use Monday.
                    day = (day == -1) ? 6 : day;
                    
                    // Get amount of pomodoros done since the last pomodoro, including this one
                    var pomodorosDone = card.pomodoros[i].pomodoroNumber - this.previousNumber;

                    // Increase that weekdays pomodoro count
                    this.weekdays.pomodoros[day] += pomodorosDone;

                    // Increase that hours pomodoro count
                    this.hours.pomodoros[hour] += pomodorosDone;

                    // For the 2d array
                    this.week[day][hour] += pomodorosDone;
                    
                    // Store for the next round
                    this.previousNumber = card.pomodoros[i].pomodoroNumber;
                }
            },
            getWeekdays: function() { return JSON.stringify(this.weekdays) },
            getHours: function() { return JSON.stringify(this.hours) },
            getDaysHours: function() { return JSON.stringify(this.week) }
        }
    }

};

