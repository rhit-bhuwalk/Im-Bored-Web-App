var rhit = rhit || {};

// Firstore collection names
rhit.FB_COLLECTION_ACTIVITIES = "activities";
rhit.FB_COLLECTION_HISTORY = "historys";
rhit.FB_COLLECTION_REVIEWS = "reviews";
rhit.FB_COLLECTION_USERS = "users";
rhit.FB_COLLECTION_REPORTS = "reports";
rhit.FB_COLLECTION_WORDS = "words";

// Firestore data names
rhit.FB_KEY_HISTORY = "history";
rhit.FB_KEY_TYPE = "type";
rhit.FB_KEY_PARTICPANTS = "participants";
rhit.FB_KEY_ACTIVITY = "activity";
rhit.FB_KEY_AVAILABILITY = "accessibility";
rhit.FB_KEY_AUTHOR = "author";
rhit.FB_KEY_DURATION = "duration";
rhit.FB_KEY_REVIEW_ACTIVITY = "activity";
rhit.FB_KEY_REVIEW_AUTHOR = "author";
rhit.FB_KEY_REVIEW_TEXT = "text";
rhit.FB_KEY_REVIEW_VALUE = "value";
rhit.FB_KEY_REVIEW_TIME = "createdAt"
rhit.FB_KEY_NAME = "name";
rhit.FB_KEY_CREATED = "createdAt"
rhit.FB_KEY_REPORT_TEXT = "text"
rhit.FB_KEY_REPORT_TYPE = "type"
rhit.FB_KEY_REPORT_ID = "id"
rhit.FB_KEY_REPORT_TIME = "timestamp"
rhit.FB_KEY_WORDS = "words"

// Valid values for activity type, access and duration
rhit.validTypes = ["any", "education", "recreational", "social", "diy", "charity", "cooking", "relaxation", "music", "busywork"];
rhit.validAccess = ["Few to no challenges", "Minor challenges", "Major challenges"];
rhit.validDuration = ["minutes", "hours", "days", "weeks"];

// Global profile manager
rhit.fbProfileManager = null;

// From: https://stackoverflow.com/questions/494143/creating-a-new-dom-element-from-an-html-string-using-built-in-dom-methods-or-pro/35385518#35385518
/**
 * @param {String} HTML representing a single element
 * @return {Element}
 */
function htmlToElement(html) {
	var template = document.createElement('template');
	html = html.trim();
	template.innerHTML = html;
	return template.content.firstChild;
};

rhit.FbProfanityManager = class {
	constructor(text) {
		return new Promise((resolve, reject) => {
			firebase.firestore().collection(rhit.FB_COLLECTION_WORDS).doc("bad").get().then((wordDoc) => {
				const badWords = wordDoc.get(rhit.FB_KEY_WORDS).filter((word) => {
					return new RegExp(`\\b${word.replace(/(\W)/g, '\\$1')}\\b`, 'gi').test(text);
				})

				if (badWords.length > 0) {
					resolve(badWords)
				} else {
					resolve(false)
				}
			}).catch((err) => {
				console.log(err);
				reject("Unable to verify your text")
			})
		})

	}
}

rhit.FbProfileManager = class {
	constructor() {
		this.deletingAccount = false;
		this._user = null; //Track user object
		this._historySnapshot = null; //History for the user
		this._createdSnapshots = null; //User created activities
		this._reviewSnapshots = null; //User reviews
		this._historyRef = null; //Reference to firestore history collection for user
		this._activityRef = firebase.firestore().collection(rhit.FB_COLLECTION_ACTIVITIES); //reference to firestore activities
		this.displayName = null; //The users display name
		this._userRef = null; //Reference to users display name
		this.creatingAccount = false; //If they are currently creating an account (prevents page refresh when creating account)
		this._reviewRef = firebase.firestore().collection(rhit.FB_COLLECTION_REVIEWS); //reference to firestore reviews
	}

	// Listen to sign in/sign out/name change
	beginListening(changeListener) {
		firebase.auth().onAuthStateChanged((user) => {
			this._user = user; //Set saved user to current user
			if (this._user) { //if user is signed in
				this._historyRef = firebase.firestore().collection(rhit.FB_COLLECTION_HISTORY).doc(this._user.uid); //save users histoy reference

				this._userRef = firebase.firestore().collection(rhit.FB_COLLECTION_USERS).doc(this._user.uid); //save username reference
			} else {
				this._historyRef = null; //remove saved history
				this._userRef = null; //remove saved username
			}
			changeListener();
		})
	}

	//listen for username change
	beginUsernameListening(changeListener) {
		if (!this._userRef) {
			changeListener();
			return;
		}
		this._userRef.onSnapshot((docSnap) => {
			if (this.deletingAccount) return;
			this.displayName = docSnap.get(rhit.FB_KEY_NAME); //save displayName
			changeListener(); //update
		})
	}

	//listen for updated created activities
	beginCreatedListening(changeListener) {
		//Get activitys made by current user and order from new to old
		this._activityRef.where(rhit.FB_KEY_AUTHOR, "==", this.uid).orderBy(rhit.FB_KEY_CREATED, "desc").onSnapshot((docSnapshots) => {
			if (this.deletingAccount) return;
			this._createdSnapshots = docSnapshots.docs; //Save created docs

			changeListener(); //update
		})
	}

	//listen for new activities in history
	beginHistoryListening(changeListener) {
		this._historyRef.onSnapshot((docSnapshot) => {
			if (this.deletingAccount) return;
			this._historySnapshot = docSnapshot.get(rhit.FB_KEY_HISTORY); //save history

			changeListener(); //update
		})
	}

	//listen for new reviews
	beginReviewListening(changeListener) {
		//Get reviews made by current user
		this._reviewRef.where(rhit.FB_KEY_REVIEW_AUTHOR, "==", this.uid).orderBy(rhit.FB_KEY_REVIEW_TIME, "desc").onSnapshot((docSnapshots) => {
			if (this.deletingAccount) return;
			this._reviewSnapshots = docSnapshots.docs; //save reviews

			changeListener(); //update
		})
	}

	//Update the current users username
	updateUsername(name) {
		//Return a promise
		return new Promise((resolve, reject) => {
			if (!name) {
				reject("Please provide a valid new name");
				return;
			}

			new rhit.FbProfanityManager(name).then((profanity) => {
				if (profanity) {
					reject(`Please remove the profanity from your name.`)
					return;
				} else {
					this._userRef.set({
						[rhit.FB_KEY_NAME]: name //update username
					}).then(() => {
						resolve(); //success
					}).catch((err) => {
						console.log(err); //log error
						reject("Error updating username"); //return custom error message
					})
				}
			}).catch((err) => {
				reject(err)
			})


		})
	}

	// Create a new user account
	createAccount(email, password, confirmPassword, name) {
		//return a promise
		return new Promise((resolve, reject) => {
			if (!password || !confirmPassword) {
				reject("A password is required");
				return;
			}

			if (password !== confirmPassword) {
				reject("Passwords do not match!");
				return;
			}

			if (!email) {
				reject("Please enter a valid email.");
				return;
			}

			if (!name) {
				reject("Please enter a valid username");
				return;
			}

			new rhit.FbProfanityManager(name).then((profanity) => {
				if (profanity) {
					reject("Please remove the profanity from your name.")
					return;
				} else {
					this.creatingAccount = true; //Set that currently creating account to prevent redirects

					firebase.auth().createUserWithEmailAndPassword(email, password).then((userCredentials) => {
						const user = userCredentials.user; //save credentials

						//Create a new entry in user table to track username
						firebase.firestore().collection(rhit.FB_COLLECTION_USERS).doc(user.uid).set({
							[rhit.FB_KEY_NAME]: name
						}).then(() => {
							//success
							firebase.firestore().collection(rhit.FB_COLLECTION_HISTORY).doc(user.uid).set({
								[rhit.FB_KEY_HISTORY]: []
							}).then(() => {
								this.creatingAccount = false; //stop creating account
								resolve();
							}).catch((err) => {
								this.creatingAccount = false;
								console.log(err);
								reject("Error creating your history")
							})
						}).catch((err) => {
							//error
							this.creatingAccount = false;
							console.log(err);
							reject("Error saving your username");
						});
					}).catch((error) => {
						this.creatingAccount = false;
						console.log(error);
						if (error.code == "auth/email-already-in-use") {
							reject("There is already an account related to that email!")
						} else if (error.code == "auth/weak-password") {
							reject("Your password is too weak, try a stronger password")
						} else if (error.code == "auth/invalid-email") {
							reject("Invalid email provided, try a different email.")
						} else {
							reject("Error creating your account");
						}
					});
				}
			}).catch((err) => {
				reject(err)
			})
		})
	}

	//Sign the user in
	signIn(email, password) {
		return new Promise((resolve, reject) => {
			if (!email) {
				reject("Please enter an email")
				return;
			}
			if (!password) {
				reject("Please enter a password")
				return;
			}

			//Sign in the user
			firebase.auth().signInWithEmailAndPassword(email, password).then(() => {
				//success
				resolve();
			}).catch((err) => {
				//Error
				console.log(err);
				if (err.code == "auth/invalid-email") {
					reject("The email you provided is not a valid email address")
				} else if (err.code == "auth/user-not-found") {
					reject("There is not an account associated with that email.")
				} else if (err.code == "auth/wrong-password") {
					reject("Your password is incorrect.")
				} else {
					reject("There was an error signing you in, try again later.");
				}
			})
		})
	}

	//Log out the user
	signOut() {
		return new Promise((resolve, reject) => {
			firebase.auth().signOut().then(() => {
				//success
				resolve();
			}).catch((err) => {
				//Error
				console.log(err);
				reject("There was an error signing you out");
			})
		})
	}

	//Delete the users account
	deleteAccount(password) {
		return new Promise((resolve, reject) => {
			if (!password) {
				reject("Please provide a password");
				return;
			}

			//reauthenticate the user
			this._user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(
				this._user.email,
				password
			)).then(() => {
				//success
				console.log("Deleting history");
				this.deletingAccount = true;
				this._historyRef.delete().then(() => {
					console.log("Deleting review");
					this._deleteReviews().then(() => {
						console.log("Deleting activitys");
						this._deleteActivities().then(() => {
							console.log("Deleting user name");
							this._userRef.delete().then(() => {
								console.log("Deleting user");
								this._user.delete().then(() => {
									//deleted
									this.deletingAccount = false;
									resolve();

								}).catch((err) => {
									this.deletingAccount = false;
									console.log(err);
									reject("Error deleting the users account");
								})
							}).catch((err) => {
								this.deletingAccount = false;

								console.log(err);
								reject("Error deleting your user")
							})

						}).catch((err) => {
							this.deletingAccount = false;

							console.log(err);
							reject("Error deleting your activities")
						})
					}).catch((err) => {
						this.deletingAccount = false;

						console.log(err);
						reject("Error deleting your reviews")
					})
				}).catch((err) => {
					this.deletingAccount = false;

					console.log(err)
					reject("Error deleting your history!")
				})


			}).catch((err) => {
				//error
				this.deletingAccount = false;

				console.log(err);
				reject("Error reauthenticating, is your password correct?");
			})
		})
	}

	_deleteReviews() {
		return this._deleteReview(0)
	}

	_deleteReview(index) {
		return new Promise((resolve, reject) => {
			if (index >= this._reviewSnapshots.length) {
				resolve()
				return;
			}
			this._reviewRef.doc(this._reviewSnapshots[index].id).delete().then(() => {
				resolve(this._deleteReview(index + 1))
			}).catch((err) => {
				reject(err)
			})
		})
	}

	_deleteActivities() {
		return this._deleteActivity(0)
	}

	_deleteActivity(index) {
		return new Promise((resolve, reject) => {
			if (index >= this._createdSnapshots.length) {
				resolve()
				return;
			}
			this._activityRef.doc(this._createdSnapshots[index].id).delete().then(() => {
				resolve(this._deleteActivity(index + 1))
			}).catch((err) => {
				reject(err)
			})
		})
	}

	// Add an activity to history
	addToHistory(activityID) {
		return new Promise((resolve, reject) => {
			if (!this.isSignedIn) {
				// User isn't signed in, ignore
				resolve();
				return;
			}

			//Add to users history
			this._historyRef.update({
				[rhit.FB_KEY_HISTORY]: firebase.firestore.FieldValue.arrayUnion(activityID) //add to end of array
			}).then(() => {
				resolve(); //success
			}).catch((err) => {
				console.log(err);
				reject("Error adding activity to your history");
			})
		})
	}

	removeFromHistory(id) {
		return new Promise((resolve, reject) => {
			this._historyRef.update({
					[rhit.FB_KEY_HISTORY]: firebase.firestore.FieldValue.arrayRemove(id)
				})
				.then(() => {
					resolve()
				})
				.catch(function (error) {
					console.error(error);
					reject("There was an error removing that from your history")
				});
		})
	}

	// Create a new activity
	createActivity(name, type, access, participants, duration) {
		return new Promise((resolve, reject) => {
			if (!this.isSignedIn) {
				//Must be signed in
				reject("You are not signed in!");
				return;
			}

			if (!name) {
				reject("Please provide a name")
				return;
			}
			if (!type || !rhit.validTypes.includes(type)) {
				reject("Please provide a valid type")
				return;
			}
			if (!participants || participants < 1) {
				reject("Please provide a valid number of participants")
				return;
			}

			if (!access || !rhit.validAccess.includes(access)) {
				reject("Please select a valid accessibility")
				return;
			}

			if (!duration || !rhit.validDuration.includes(duration)) {
				reject("Please select a valid duration")
				return;
			}

			new rhit.FbProfanityManager(name).then((profanity) => {
				if (profanity) {
					reject("Please remove the profanity from your activity title.")
					return;
				} else {
					//Add to activity collection
					this._activityRef.add({
						[rhit.FB_KEY_ACTIVITY]: name,
						[rhit.FB_KEY_TYPE]: type,
						[rhit.FB_KEY_AVAILABILITY]: access,
						[rhit.FB_KEY_PARTICPANTS]: participants,
						[rhit.FB_KEY_DURATION]: duration,
						[rhit.FB_KEY_AUTHOR]: this.uid,
						[rhit.FB_KEY_CREATED]: firebase.firestore.Timestamp.now()
					}).then((docRef) => {
						// Done
						resolve(docRef);
					}).catch((err) => {
						console.log(err);
						reject("Error creating activity!");
					})
				}
			}).catch((err) => {
				reject(err)
			})
		})
	}

	// Create a new activity
	updateActivity(id, name, type, access, participants, duration) {
		return new Promise((resolve, reject) => {
			if (!this.isSignedIn) {
				//Must be signed in
				reject("You are not signed in!");
				return;
			}

			if (!id) {
				reject("No provided ID")
				return;
			}

			if (!name) {
				reject("Please provide a name")
				return;
			}
			if (!type || !rhit.validTypes.includes(type)) {
				reject("Please provide a valid type")
				return;
			}
			if (!participants || participants < 1) {
				reject("Please provide a valid number of participants")
				return;
			}

			if (!access || !rhit.validAccess.includes(access)) {
				reject("Please select a valid accessibility")
				return;
			}

			if (!duration || !rhit.validDuration.includes(duration)) {
				reject("Please select a valid duration")
				return;
			}

			new rhit.FbProfanityManager(name).then((profanity) => {
				if (profanity) {
					reject("Please remove the profanity from the name.")
					return;
				} else {
					//Update to activity collection
					this._activityRef.doc(id).update({
						[rhit.FB_KEY_ACTIVITY]: name,
						[rhit.FB_KEY_TYPE]: type,
						[rhit.FB_KEY_AVAILABILITY]: access,
						[rhit.FB_KEY_PARTICPANTS]: participants,
						[rhit.FB_KEY_DURATION]: duration
					}).then((docRef) => {
						// Done
						resolve();
					}).catch((err) => {
						console.log(err);
						reject("Error updating activity!");
					})
				}
			}).catch((er) => {
				reject(er)
			})


		})
	}

	//get if signed in
	get isSignedIn() {
		return !!this._user;
	}

	//get uid of user
	get uid() {
		return this._user.uid;
	}

	//get name of user
	get name() {
		return this.displayName;
	}

	//get the number of created activities
	get createdLength() {
		if (!this._createdSnapshots) return 0;
		return this._createdSnapshots.length;
	}

	//get the id of the created activity at an index
	createdIDAtIndex(index) {
		const createdID = this._createdSnapshots[index];
		if (!createdID) throw new Error("Index out of bounds");
		return createdID.id;
	}

	//get number of items in history
	get historyLength() {
		if (!this._historySnapshot) return 0;
		return this._historySnapshot.length;
	}

	//get id of activity in history at index
	historyIDAtIndex(index) {
		const historyRef = this._historySnapshot[index];
		if (!historyRef) throw new Error("Index out of bounds");
		return historyRef;
	}

	//get number of reviews
	get reviewLength() {
		if (!this._reviewSnapshots) return 0;
		return this._reviewSnapshots.length;
	}

	//get review id at index
	reviewIDAtIndex(index) {
		const reviewID = this._reviewSnapshots[index];
		if (!reviewID) throw new Error("Index out of bounds");
		return reviewID.id;
	}
}

rhit.ReviewPageController = class {
	constructor(urlParams) {
		const uid = urlParams.get("id")
		const edit = urlParams.get("edit")
		if (rhit.fbProfileManager.isSignedIn) {
			//if user is signed in add sign out button and show profile
			document.getElementById("logout-button").onclick = (event) => {
				rhit.fbProfileManager.signOut().catch((err) => {
					alert(err);
				})
			}
		} else {
			//if user isn't signed in go back, must be signed in to view page
			alert("You must be signed in to review an activity");
			window.location.href = "./";
			return;
		}

		if (!uid && !edit) {
			alert("No activity provided");
			window.location.href = "./index.html";
			return;
		}

		if (uid) {
			this.reviewValue = 5; //Default review value
			this._beginStarListening()
			this._activity = new rhit.FbActivityManager(uid); //make a new activity with the ID
			this._activity.exists.then((exists) => {
				if (!exists) {
					alert("Invalid activity ID");
					window.location.href = "./index.html";
					return;
				}
			}).catch((message) => {
				alert(message);
				window.location.href = "./index.html"
			});

			//listen for user submitting review
			document.getElementById("submit-button").onclick = () => {
				const reviewText = document.getElementById("review-text").value || "";

				this._activity.addReview(this.reviewValue, reviewText).then((reviewRef) => {
					//Redirect to reviewed activity
					window.location.href = `./activity.html?id=${this._activity.id}`;
				}).catch((err) => {
					//Alert error
					alert(err);
				})
			}

			// Listen to activity changes (required to see if user has reviewed)
			this._activity.beginListening(this.updateView.bind(this));
		} else if (edit) {
			const reviewManager = new rhit.FbReviewManager(edit)
			reviewManager.get().then((review) => {
				this.reviewValue = review.stars
				this._updateReviewStars(review.stars)
				this._beginStarListening()
				document.getElementById("review-title").innerHTML = review.activity
				document.getElementById("review-text").innerHTML = review.text;
				document.getElementById("submit-button").innerHTML = "Update"
				document.getElementById("submit-button").onclick = () => {
					const reviewText = document.getElementById("review-text").value || "";

					reviewManager.update(this.reviewValue, reviewText).then(() => {
						window.location.href = `./activity.html?id=${review.activityID}`
					}).catch((err) => {
						alert(err)
					})
				}
			})
		}

		// Listen for username changes
		rhit.fbProfileManager.beginUsernameListening(this.updateDisplayName.bind(this));
	}

	updateDisplayName() {
		//update showed name
		document.getElementById("profile-name").innerHTML = rhit.fbProfileManager.name;
		document.getElementById("profile-dropdown").style.display = "";
	}

	updateView() {
		//Check if user has reviewed the activity
		this._activity.hasUserReviewed().then((reviewed) => {
			if (reviewed) {
				//reject reviewing twice
				alert("You cannot review an activity twice");
				window.location.href = "./index.html";
			} else {
				// Set activity title
				document.getElementById("review-title").innerHTML = this._activity.activity;
			}
		}).catch((err) => {
			//unable to verify if reviewed
			alert(err);
			window.location.href = "./index.html";
		})
	}

	_beginStarListening() {
		//Add click listeners to udpate review with
		document.getElementById("1-star").onclick = (event) => {
			this._updateReviewStars(1);
		}
		document.getElementById("2-star").onclick = (event) => {
			this._updateReviewStars(2);
		}
		document.getElementById("3-star").onclick = (event) => {
			this._updateReviewStars(3);
		}
		document.getElementById("4-star").onclick = (event) => {
			this._updateReviewStars(4);
		}
		document.getElementById("5-star").onclick = (event) => {
			this._updateReviewStars(5);
		}
	}

	_updateReviewStars(val) {
		//save review value
		this.reviewValue = val;

		//get elements
		const oneStar = document.getElementById("1-star");
		const twoStar = document.getElementById("2-star");
		const threeStar = document.getElementById("3-star");
		const fourStar = document.getElementById("4-star");
		const fiveStar = document.getElementById("5-star");

		//uncheck all
		oneStar.classList.remove("checked");
		twoStar.classList.remove("checked");
		threeStar.classList.remove("checked");
		fourStar.classList.remove("checked");
		fiveStar.classList.remove("checked");

		//Check stars
		switch (val) {
			case 5:
				fiveStar.classList.add("checked");
			case 4:
				fourStar.classList.add("checked");
			case 3:
				threeStar.classList.add("checked");
			case 2:
				twoStar.classList.add("checked");
			case 1:
				oneStar.classList.add("checked");
		}
	}
}

rhit.CreatePageController = class {
	constructor(id) {
		if (rhit.fbProfileManager.isSignedIn) {
			//if user is signed in add log out and show profile
			document.getElementById("logout-button").onclick = (event) => {
				rhit.fbProfileManager.signOut().catch((err) => {
					alert(err);
				})
			}
		} else {
			//if user isn't signed in
			alert("You must be signed in to create an activity");
			window.location.href = "./";
		}
		if (!id) {
			//Handle create click
			document.getElementById("create-button").onclick = (event) => {
				const name = document.getElementById("new-activity-name-field").value;
				const type = document.getElementById("type-select").value;
				const participants = parseInt(document.getElementById("participant-input").value);
				const access = document.getElementById("access-select").value;
				const duration = document.getElementById("duration-select").value;

				rhit.fbProfileManager.createActivity(name, type, access, participants, duration).then((docRef) => {
					window.location.href = `./activity.html?id=${docRef.id}`;
				}).catch((err) => {
					alert(err);
				})
			}
		} else {
			document.getElementById("page-title").innerHTML = "Edit Activity"
			document.getElementById("create-button").innerHTML = "Update Activity"
			new rhit.FbActivityManager(id).get().then((activity) => {
				if (activity[rhit.FB_KEY_AUTHOR] != rhit.fbProfileManager.uid) {
					alert("You are not the author of this activity")
					window.location.href = "./"
					return;
				}
				document.getElementById("new-activity-name-field").value = activity[rhit.FB_KEY_ACTIVITY];
				document.getElementById("type-select").value = activity[rhit.FB_KEY_TYPE]
				document.getElementById("access-select").value = activity[rhit.FB_KEY_AVAILABILITY]
				document.getElementById("duration-select").value = activity[rhit.FB_KEY_DURATION]
				document.getElementById("participant-input").value = activity[rhit.FB_KEY_PARTICPANTS]

				document.getElementById("create-button").onclick = (event) => {
					const name = document.getElementById("new-activity-name-field").value;
					const type = document.getElementById("type-select").value;
					const participants = parseInt(document.getElementById("participant-input").value);
					const access = document.getElementById("access-select").value;
					const duration = document.getElementById("duration-select").value;

					rhit.fbProfileManager.updateActivity(id, name, type, access, participants, duration).then((docRef) => {
						window.location.href = `./activity.html?id=${id}`;
					}).catch((err) => {
						alert(err);
					})
				}
			}).catch((err) => {
				alert(err)
			})


		}


		rhit.fbProfileManager.beginUsernameListening(this.updateDisplayName.bind(this));
	}

	//Handle new name
	updateDisplayName() {
		document.getElementById("profile-name").innerHTML = rhit.fbProfileManager.name;
		document.getElementById("profile-dropdown").style.display = "";
	}
}

rhit.ProfilePageController = class {
	constructor() {
		if (rhit.fbProfileManager.isSignedIn) {
			//enable sign out button
			document.getElementById("logout-button").onclick = (event) => {
				rhit.fbProfileManager.signOut().catch((err) => {
					alert(err);
				})
			}
		} else {
			window.location.href = "./";
		}

		// If user tries to change their name
		document.getElementById("submit-new-name").onclick = (event) => {
			const newName = document.getElementById("new-name-field").value;

			rhit.fbProfileManager.updateUsername(newName).catch((err) => {
				alert(err);
			})
		}

		// If user tries to delete account
		document.getElementById("delete-account-button").onclick = (event) => {
			const pwd = document.getElementById("delete-password-field").value;

			rhit.fbProfileManager.deleteAccount(pwd).catch((err) => {
				alert(err);
			})
		}

		rhit.fbProfileManager.beginHistoryListening(this.updateHistory.bind(this));
		rhit.fbProfileManager.beginCreatedListening(this.updateCreated.bind(this));
		rhit.fbProfileManager.beginReviewListening(this.updateReviews.bind(this));
		rhit.fbProfileManager.beginUsernameListening(this.updateDisplayName.bind(this));
	}

	// If username changes
	updateDisplayName() {
		document.getElementById("new-name-field").value = ""
		document.getElementById("profile-name").innerHTML = rhit.fbProfileManager.name;
		document.getElementById("profile-dropdown").style.display = "";
	}

	// If new reviews
	updateReviews() {
		if (rhit.fbProfileManager.reviewLength < 1) {
			//Hide review container
			document.getElementById("reviews-container").style.display = "none";
		} else {
			//Reset container
			document.getElementById("reviews-container").innerHTML = `<hr>
            <div class="row ml-1">
                <h2 class="mt-2"><strong>Reviews:</strong></h2>
            </div>`;
			//Go through each review
			for (let i = 0; i < rhit.fbProfileManager.reviewLength; i++) {
				new rhit.FbReviewManager(rhit.fbProfileManager.reviewIDAtIndex(i)).get().then((review) => {
					document.getElementById("reviews-container").appendChild(this._createReviewCard(review));
				}).catch((err) => {
					alert(err);
				})
			}
			//Display
			document.getElementById("reviews-container").style.display = ""
		}
	}

	// New history
	updateHistory() {
		if (rhit.fbProfileManager.historyLength < 1) {
			document.getElementById("history-container").style.display = "none";
		} else {
			document.getElementById("history-container").innerHTML = `<hr>
            <div class="row ml-1">
                <h2 class="mt-2"><strong>History:</strong></h2>
            </div>`;
			for (let i = rhit.fbProfileManager.historyLength - 1; i >= 0; i--) {
				new rhit.FbActivityManager(rhit.fbProfileManager.historyIDAtIndex(i)).get().then((history) => {
					history.id = rhit.fbProfileManager.historyIDAtIndex(i);
					document.getElementById("history-container").appendChild(this._createHistoryCard(history));
				}).catch((err) => {
					alert(err);
				})
			}
			document.getElementById("history-container").style.display = "";
		}
	}

	// New created
	updateCreated() {
		if (rhit.fbProfileManager.createdLength < 1) {
			document.getElementById("activities-container").style.display = "none";
		} else {
			document.getElementById("activities-container").innerHTML = `<hr>
            <div class="row ml-1">
                <h2 class="mt-2"><strong>Your Activities:</strong></h2>
            </div>`;
			for (let i = 0; i < rhit.fbProfileManager.createdLength; i++) {
				new rhit.FbActivityManager(rhit.fbProfileManager.createdIDAtIndex(i)).get().then((created) => {
					created.id = rhit.fbProfileManager.createdIDAtIndex(i);
					document.getElementById("activities-container").appendChild(this._createCreatedCard(created));
				}).catch((err) => {
					alert(err);
				})
			}
			document.getElementById("activities-container").style.display = "";
		}
	}

	_deleteHistory(id) {
		rhit.fbProfileManager.removeFromHistory(id).catch((err) => {
			alert(err)
		})
	}

	// Make an HTML element for history
	_createHistoryCard(history) {
		return htmlToElement(`<div class="mb-4">
		<div class="row ml-3">
			<div class="col-7 col-md-7">
				<a class="h4" href="/activity.html?id=${history.id}"><strong>${history.activity}</strong></a>
			</div>
			<div class="col-5 col-md-3 mt-1">
				<span class="fa fa-star ${history.rating >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${history.rating >= 2 ? "checked" : ""}"></span>
				<span class="fa fa-star ${history.rating >= 3 ? "checked" : ""}"></span>
				<span class="fa fa-star ${history.rating >= 4 ? "checked" : ""}"></span>
				<span class="fa fa-star ${history.rating >= 5 ? "checked" : ""}"></span>
			</div>
			<div class="col-5 col-md-2">
				<button type="button" class="btn btn-sm btn-outline-danger" onclick="rhit.profilePageController._deleteHistory('${history.id}')">Delete</button>
			</div>
		</div>
	</div>`);
	}

	// Make an HTML element for a created activity
	_createCreatedCard(created) {
		return htmlToElement(`<div class="mb-4">
		<div class="row ml-3">
			<div class="col-7 col-md-7">
				<a class="h4" href="./activity.html?id=${created.id}"><strong>${created.activity}</strong></a>
			</div>
			<div class="col-5 col-md-3 mt-1">
				<span class="fa fa-star ${created.rating >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${created.rating >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${created.rating >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${created.rating >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${created.rating >= 1 ? "checked" : ""}"></span>
			</div>
			<div class="col-5 col-md-2">
				<a type="button" class="btn btn-sm btn-outline-primary" target="_blank" href="./create.html?edit=${created.id}">Edit</a>
			</div>
		</div>
	</div>`);
	}

	// Make an HTML element for a review
	_createReviewCard(review) {
		return htmlToElement(`<div class="mb-4">
		<div class="row ml-3">
			<div class="col-7 col-md-7">
				<a class="h4" href="./activity.html?id=${review.activityID}"><strong>${review.activity}</strong></a>
			</div>
			<div class="col-5 col-md-3 mt-1">
				<span class="fa fa-star ${review.stars >= 1 ? "checked" : ""}"></span>
				<span class="fa fa-star ${review.stars >= 2 ? "checked" : ""}"></span>
				<span class="fa fa-star ${review.stars >= 3 ? "checked" : ""}"></span>
				<span class="fa fa-star ${review.stars >= 4 ? "checked" : ""}"></span>
				<span class="fa fa-star ${review.stars >= 5 ? "checked" : ""}"></span>
			</div>
			<div class="col-5 col-md-2">
				<a type="button" class="btn btn-sm btn-outline-primary" target="_blank" href="./review.html?edit=${review.id}">Edit</a>
			</div>
		</div>
		<div class="row">
			<p class="ml-5">${review.text}</p>
		</div>
	</div>`);
	}
}

rhit.LoginPageController = class {
	constructor() {
		if (rhit.fbProfileManager.isSignedIn) {
			// user cannot login while being logged in
			window.location.href = "./index.html";
			return;
		}

		$("#createAccountModal").on("show.bs.modal", (e) => {
			// fill in email field if user already typed in email
			document.getElementById("create-email-field").value = document.getElementById("login-email-field").value;
		});

		document.getElementById("login-button").onclick = (event) => {
			//Login the user
			const email = document.getElementById("login-email-field").value;
			const password = document.getElementById("login-password-field").value;

			rhit.fbProfileManager.signIn(email, password).then(() => {
				window.location.href = "./index.html";
			}).catch((error) => {
				alert(error);
			});
		}

		document.getElementById("create-account-button").onclick = (event) => {
			// User tries to create an account
			const username = document.getElementById("create-username-field").value;
			const email = document.getElementById("create-email-field").value;
			const password1 = document.getElementById("create-password-field").value;
			const password2 = document.getElementById("create-second-password-field").value;

			rhit.fbProfileManager.createAccount(email, password1, password2, username).then(() => {
				window.location.href = "./index.html";
			}).catch((error) => {
				alert(error);
			})
		}
	}
}

rhit.FbReviewManager = class {
	constructor(reviewID) {
		this._reviewID = reviewID
		this._review = {}; // Object with review
		this._reviewRef = firebase.firestore().collection(rhit.FB_COLLECTION_REVIEWS).doc(reviewID); // Reference to the review
		this._reportRef = firebase.firestore().collection(rhit.FB_COLLECTION_REPORTS)
	}

	// Get review one time
	get() {
		return new Promise((resolve, reject) => {
			// Get the review
			this._reviewRef.get().then((reviewDoc) => {
				//Save data
				this._review.value = reviewDoc.get(rhit.FB_KEY_REVIEW_VALUE);
				this._review.text = reviewDoc.get(rhit.FB_KEY_REVIEW_TEXT);
				//Get the activity related to the review
				firebase.firestore().collection(rhit.FB_COLLECTION_ACTIVITIES).doc(reviewDoc.get(rhit.FB_KEY_REVIEW_ACTIVITY)).get().then((activityDoc) => {
					//save data
					this._review.activitySnapshot = activityDoc;
					//Get the user related to the activity
					firebase.firestore().collection(rhit.FB_COLLECTION_USERS).doc(reviewDoc.get(rhit.FB_KEY_REVIEW_AUTHOR)).get().then((authorDoc) => {
						//Save the author
						this._review.author = authorDoc.get(rhit.FB_KEY_NAME);
						//Resolve with the data
						resolve({
							author: this.author,
							stars: this.stars,
							text: this.text,
							activity: this.activity,
							activityID: this.activityID,
							id: this._reviewID
						});
					}).catch((error) => {
						//err
						console.log(error);
						reject("There was an error getting the author of the review");
					})
				}).catch((er) => {
					//err
					console.log(er);
					reject("There was an error getting the reviewed activity");
				})
			}).catch((err) => {
				//err
				console.log(err);
				reject("There was an error getting the review");
			})
		})
	}

	update(stars, text) {
		return new Promise((resolve, reject) => {
			new rhit.FbProfanityManager(text).then((profanity) => {
				if (profanity) {
					reject("Please remove the profanity from your review.")
					return;
				} else {
					this._reviewRef.update({
						[rhit.FB_KEY_REVIEW_VALUE]: stars,
						[rhit.FB_KEY_REVIEW_TEXT]: text
					}).then(() => {
						resolve()
					}).catch((err) => {
						console.log(err);
						alert("Error updating your review!")
					})
				}
			}).catch((err) => {
				reject(err)
			})
		})
	}

	addReport() {
		return new Promise((resolve, reject) => {
			this._reportRef.add({
				[rhit.FB_KEY_REPORT_ID]: this._reviewID,
				[rhit.FB_KEY_REPORT_TYPE]: "review",
				[rhit.FB_KEY_REPORT_TIME]: firebase.firestore.Timestamp.now()
			}).then((reportRef) => {
				resolve();
			}).catch((err) => {
				console.log(err);
				reject("Error adding your report");
			})
		})
	}

	// get the review author
	get author() {
		return this._review.author;
	}

	// get the review stars
	get stars() {
		return this._review.value;
	}

	// get the reviews text
	get text() {
		return this._review.text;
	}

	// get the activity
	get activity() {
		return this._review.activitySnapshot.get(rhit.FB_KEY_ACTIVITY);
	}

	// get the id of the activity
	get activityID() {
		return this._review.activitySnapshot.id;
	}
}

rhit.FbActivityManager = class {
	constructor(id) {
		this.id = id; //save the ID
		this._documentSnapshot = {}; //save document snapshot
		this._reviews = []; //save reviews
		this._ref = firebase.firestore().collection(rhit.FB_COLLECTION_ACTIVITIES).doc(id); // reference to activity
		this._reviewRef = firebase.firestore().collection(rhit.FB_COLLECTION_REVIEWS); //reference to review collection
		this._reportRef = firebase.firestore().collection(rhit.FB_COLLECTION_REPORTS)
	}

	beginListening(changeListener) {
		// listen to changes to the activity
		this._ref.onSnapshot((doc) => {
			if (doc.exists) {
				this._documentSnapshot = doc;
			} else {
				this._documentSnapshot = null;
			}
			changeListener()
		})
	}

	beginReviewsListening(changeListener) {
		//listen to new reviews
		this._reviewRef.where(rhit.FB_KEY_REVIEW_ACTIVITY, "==", this.id).onSnapshot((reviews) => {
			this._reviews = reviews.docs;
			changeListener();
		})
	}

	//gte the activity once
	get() {
		return new Promise((resolve, reject) => {
			//get the activity ref
			this._ref.get().then((doc) => {
				//save activity
				const activity = doc.data();
				//get the reviews related to the activity
				this._reviewRef.where(rhit.FB_KEY_REVIEW_ACTIVITY, "==", this.id).get().then((reviews) => {
					//save data
					activity.numReviews = reviews.docs.length;
					//calculate the rating
					activity.rating = 0;
					if (activity.numReviews > 0) {
						reviews.docs.forEach(review => {
							activity.rating += review.get(rhit.FB_KEY_REVIEW_VALUE);
						});
						activity.rating /= activity.numReviews;
					}

					resolve(activity);
				}).catch((err) => {
					console.log(err);
					reject("Error getting activity reviews");
				})
			}).catch((err) => {
				console.log(err);
				reject("Error getting the activity");
			})
		})
	}

	//Add a review to the activity
	addReview(value, text) {
		return new Promise((resolve, reject) => {
			text = text.replace(/\r?\n|\r/g, ""); //Trim

			// validate
			if (!value || value < 1 || value > 5) {
				reject("Please provide a valid rating");
				return;
			}
			new rhit.FbProfanityManager(text).then((profanity) => {
				if (profanity) {
					reject("Please remove the profanity in your review.")
					return;
				} else {
					//Add the review
					this._reviewRef.add({
						[rhit.FB_KEY_REVIEW_ACTIVITY]: this.id,
						[rhit.FB_KEY_REVIEW_AUTHOR]: rhit.fbProfileManager.uid,
						[rhit.FB_KEY_REVIEW_TEXT]: text,
						[rhit.FB_KEY_REVIEW_VALUE]: value,
						[rhit.FB_KEY_REVIEW_TIME]: firebase.firestore.Timestamp.now()
					}).then((reviewRef) => {
						resolve(reviewRef);
					}).catch((err) => {
						console.log(err);
						reject("Error adding your review");
					})
				}
			})
		})
	}

	addReport(text) {
		return new Promise((resolve, reject) => {
			text = text.replace(/\r?\n|\r/g, ""); //Trim
			// not checking for profanity because this is just going to be seen by admins
			//Add the report
			this._reportRef.add({
				[rhit.FB_KEY_REPORT_ID]: this.id,
				[rhit.FB_KEY_REPORT_TEXT]: text,
				[rhit.FB_KEY_REPORT_TYPE]: "activity",
				[rhit.FB_KEY_REPORT_TIME]: firebase.firestore.Timestamp.now()
			}).then((reportRef) => {
				resolve();
			}).catch((err) => {
				console.log(err);
				reject("Error adding your report");
			})
		})
	}

	//Check if the user has reviewed
	hasUserReviewed() {
		return new Promise((resolve, reject) => {
			//Get the users review
			this._reviewRef.where(rhit.FB_KEY_REVIEW_ACTIVITY, "==", this.id).where(rhit.FB_KEY_REVIEW_AUTHOR, "==", rhit.fbProfileManager.uid).get().then((docSnapshots) => {
				//if the num of docs is more than 0
				resolve(docSnapshots.docs.length >= 1);
			}).catch((err) => {
				console.log(err);
				reject("There was an error verifying if you have reviewed this activity before");
			})
		})

	}

	// get if the activity exists
	get exists() {
		return new Promise((resolve, reject) => {
			// get the activity
			this._ref.get().then((docSnap) => {
				resolve(docSnap.exists); //resolve if it exists
			}).catch((err) => {
				console.log(err);
				reject("Error getting activity");
			})
		})
	}

	// get the activity
	get activity() {
		return this._documentSnapshot.get(rhit.FB_KEY_ACTIVITY);
	}

	// Get the activity type
	get type() {
		return this._documentSnapshot.get(rhit.FB_KEY_TYPE);
	}

	// Get the activity participants
	get participants() {
		return this._documentSnapshot.get(rhit.FB_KEY_PARTICPANTS);
	}

	// get the activities availability
	get availability() {
		return this._documentSnapshot.get(rhit.FB_KEY_AVAILABILITY);
	}

	// Get the activities duration
	get duration() {
		return this._documentSnapshot.get(rhit.FB_KEY_DURATION);
	}

	// Get the activities number reviews
	get numReviews() {
		return this._reviews.length;
	}

	// Get the review at index
	getReviewIDAtIndex(index) {
		const review = this._reviews[index]
		if (!review) throw new Error("Index out of range")
		return review.id;
	}

	// Get the overall rating
	get rating() {
		let rating = 0;
		if (this.numReviews > 0) {
			this._reviews.forEach(review => {
				rating += review.get(rhit.FB_KEY_REVIEW_VALUE)
			});
			rating /= this.numReviews
		}
		return rating
	}
}

rhit.ActivityPageController = class {
	constructor() {
		if (rhit.fbProfileManager.isSignedIn) {
			//hide login button and enable logout button
			document.getElementById("login-button").style.display = "none";
			document.getElementById("logout-button").onclick = (event) => {
				rhit.fbProfileManager.signOut().catch((err) => {
					alert(err);
				})
			}
		} else {
			//hide profile, show login button
			document.getElementById("profile-dropdown").style.display = "none";
			document.getElementById("login-button").style.display = "";
		}

		document.getElementById("report-button").onclick = () => {
			const reportText = document.getElementById("report-text").value
			rhit.fbActivityManager.addReport(reportText).then(() => {
				alert("Report added.")
			}).catch((err) => {
				alert(err)
			})
		}

		rhit.fbActivityManager.beginListening(this.updateView.bind(this));
		rhit.fbActivityManager.beginReviewsListening(this.updateReviews.bind(this));
		rhit.fbProfileManager.beginUsernameListening(this.updateDisplayName.bind(this));
	}

	// update name
	updateDisplayName() {
		document.getElementById("profile-name").innerHTML = rhit.fbProfileManager.name;
		document.getElementById("profile-dropdown").style.display = "";
	}

	// Update activity
	updateView() {
		document.getElementById("activity-title").innerHTML = rhit.fbActivityManager.activity;
		document.getElementById("type").innerHTML = `Type: ${rhit.fbActivityManager.type}`;
		document.getElementById("participants").innerHTML = `Participants: ${rhit.fbActivityManager.participants}`;
	}

	// Show review
	updateReviews() {
		rhit.fbActivityManager.hasUserReviewed().then((reviewed) => {
			//decide if to show review button
			if (reviewed) {
				document.getElementById("review-button").style.display = "none";
			} else {
				document.getElementById("review-button").href = `./review.html?id=${rhit.fbActivityManager.id}`;
				document.getElementById("review-button").style.display = "";
			}
		})

		// display number of reviews
		if (rhit.fbActivityManager.numReviews < 1) {
			document.getElementById("review-header").innerHTML = `Nobody has reviewed this activity`;

		} else {
			document.getElementById("review-header").innerHTML = `Based on ${rhit.fbActivityManager.numReviews} ${rhit.fbActivityManager.numReviews == 1 ? "review": "reviews"}`;
		}

		//Get stars
		const oneStar = document.getElementById("1-star");
		const twoStar = document.getElementById("2-star");
		const threeStar = document.getElementById("3-star");
		const fourStar = document.getElementById("4-star");
		const fiveStar = document.getElementById("5-star");
		//uncheck all stars
		oneStar.classList.remove("checked");
		twoStar.classList.remove("checked");
		threeStar.classList.remove("checked");
		fourStar.classList.remove("checked");
		fiveStar.classList.remove("checked");

		// check right stars
		switch (rhit.fbActivityManager.rating) {
			case 5:
				fiveStar.classList.add("checked");
			case 4:
				fourStar.classList.add("checked");
			case 3:
				threeStar.classList.add("checked");
			case 2:
				twoStar.classList.add("checked");
			case 1:
				oneStar.classList.add("checked");
		}

		// show reviews
		if (rhit.fbActivityManager.numReviews < 1) {
			document.getElementById("reviews-container").style.display = "none";
		} else {
			document.getElementById("reviews-container").innerHTML = `<div class="row ml-1">
			<h2 class="mt-2"><strong>Reviews:</strong></h2>
		</div>`;

			for (let i = 0; i < rhit.fbActivityManager.numReviews; i++) {
				new rhit.FbReviewManager(rhit.fbActivityManager.getReviewIDAtIndex(i)).get().then((review) => {
					document.getElementById("reviews-container").appendChild(this._createReviewCard(review));
				}).catch((err) => {
					alert(err);
				})
			}

			document.getElementById("reviews-container").style.display = "";
		}
	}

	_reportReview(id) {
		new rhit.FbReviewManager(id).addReport().then(() => {
			alert("Added your report.")
		}).catch((err) => {
			alert(err)
		})
	}

	//make html element of review
	_createReviewCard(review) {
		return htmlToElement(`<div class="mb-4">
		<div class="row ml-3">
			<div class="col-7">
				<p class="h4"><strong>${review.author}</strong></p>
			</div>
			<div class="col-5 mt-1">
			<span class="fa fa-star ${review.stars >= 1 ? "checked" : ""}"></span>
			<span class="fa fa-star ${review.stars >= 2 ? "checked" : ""}"></span>
			<span class="fa fa-star ${review.stars >= 3 ? "checked" : ""}"></span>
			<span class="fa fa-star ${review.stars >= 4 ? "checked" : ""}"></span>
			<span class="fa fa-star ${review.stars >= 5 ? "checked" : ""}"></span>
			</div>
		</div>
		<div class="row">
			<p class="ml-5 col-8">${review.text}</p>
			<a class="btn btn-outline-danger btn-sm col-2" type="button" onclick="rhit.activityPageController._reportReview('${review.id}')">Report</a>
		</div>
	</div>`);
	}


}

rhit.FbActivitiesManager = class {
	constructor() {
		this._ref = firebase.firestore().collection(rhit.FB_COLLECTION_ACTIVITIES); //reference to activity collection
	}

	//Get an activity
	getRandomActivity(type, participants, access, duration) {
		return new Promise((resolve, reject) => {
			if (participants < 1) {
				reject("Please select a valid number of participants");
				return;
			}

			if (!type || !rhit.validTypes.includes(type)) {
				reject("Please select a valid type");
				return;
			}

			if (!access || !rhit.validAccess.includes(access)) {
				reject("Please select a valid maximum accessibility");
				return;
			}

			if (!duration || !rhit.validDuration.includes(duration)) {
				reject("Please select a valid duration");
				return;
			}

			let allowedAccess = [];
			let allowedDurations = [];

			// add what alloewd access
			switch (access) {
				case "Major challenges":
					allowedAccess.push("Major chalenges");
				case "Minor challenges":
					allowedAccess.push("Minor challenges");
				case "Few to no challenges":
					allowedAccess.push("Few to no challenges");
			}

			// add allowed duration
			switch (duration) {
				case "weeks":
					allowedDurations.push("weeks");
				case "days":
					allowedDurations.push("days");
				case "hours":
					allowedDurations.push("hours");
				case "minutes":
					allowedDurations.push("minutes");
			}

			//Build query
			let query = this._ref.where(rhit.FB_KEY_PARTICPANTS, ">=", participants).where(rhit.FB_KEY_DURATION, "in", allowedDurations);

			//if not type any add filter for that type
			if (type != "any") {
				query = query.where(rhit.FB_KEY_TYPE, "==", type);
			}

			// get query
			query.get().then((querySnapshots) => {
				//save filtered
				const possibleSnapshots = [];
				//check for correct access (can't do 2 "in" queries at a time)
				querySnapshots.forEach(doc => {
					if (allowedAccess.includes(doc.data()[rhit.FB_KEY_AVAILABILITY])) possibleSnapshots.push(doc.id); //if alloewd access
				});

				//if no activity
				if (possibleSnapshots.length < 1) {
					reject("No activity could be found! Try a broader search");
					return;
				}

				// get a random one
				const activityID = possibleSnapshots[Math.floor(Math.random() * possibleSnapshots.length)];

				// add to history
				rhit.fbProfileManager.addToHistory(activityID).then(() => {
					resolve(activityID);
				}).catch((err) => {
					console.log(err);
					reject("Error adding activity to history!");
				})
			}).catch(function (error) {
				console.log(error);
				reject("Error getting an activity")
			});
		})
	}
}

rhit.HomePageController = class {
	constructor() {
		//show logout, hide login button
		if (rhit.fbProfileManager.isSignedIn) {
			document.getElementById("login-button").style.display = "none";
			document.getElementById("logout-button").onclick = (event) => {
				rhit.fbProfileManager.signOut().catch((err) => {
					alert(err);
				})
			}
		} else {
			//hide profile, show login
			document.getElementById("profile-dropdown").style.display = "none";
			document.getElementById("login-button").style.display = "";
		}

		//when activity button is clicked
		document.getElementById("activity-button").onclick = (event) => {
			const type = document.getElementById("type-select").value.toLowerCase();
			const participants = parseInt(document.getElementById("participant-input").value);
			const access = document.getElementById("access-select").value;
			const duration = document.getElementById("duration-select").value;

			rhit.fbActivitiesManager.getRandomActivity(type, participants, access, duration).then((randomActivity) => {
				window.location.href = `/activity.html?id=${randomActivity}`;
				//redirect to activity
			}).catch((error) => {
				alert(error)
			})
		}

		rhit.fbProfileManager.beginUsernameListening(this.updateDisplayName.bind(this));
	}

	updateDisplayName() {
		document.getElementById("profile-name").innerHTML = rhit.fbProfileManager.name;
		document.getElementById("profile-dropdown").style.display = "";
	}
}

rhit.main = function () {
	console.log("Ready");
	//Get urlparams
	const urlParams = new URLSearchParams(window.location.search);
	//create profile manager
	rhit.fbProfileManager = new rhit.FbProfileManager();
	//listen for uth state updates
	rhit.fbProfileManager.beginListening(() => {
		if (rhit.fbProfileManager.creatingAccount) return; //if still creating account don't update
		console.log("isSignedIn = ", rhit.fbProfileManager.isSignedIn);
		if (document.getElementById("home-page")) { //if on the home page
			rhit.fbActivitiesManager = new rhit.FbActivitiesManager(); //create activity manager
			rhit.homePageController = new rhit.HomePageController(); //create home page controller
		} else if (document.getElementById("activity-page")) { // if on activity page
			rhit.fbActivityManager = new rhit.FbActivityManager(urlParams.get("id")); //create single activity manager ith ID
			rhit.activityPageController = new rhit.ActivityPageController(); //create activity page controller
		} else if (document.getElementById("login-page")) { // if on login page
			rhit.loginPageController = new rhit.LoginPageController(); //make login page controller
		} else if (document.getElementById("profile-page")) { //if on profile page
			rhit.profilePageController = new rhit.ProfilePageController(); //create profile page controller
		} else if (document.getElementById("create-page")) { // if on create page
			rhit.createPageController = new rhit.CreatePageController(urlParams.get("edit")); //create create page controller
		} else if (document.getElementById("review-page")) { //if on review page
			rhit.reviewPageController = new rhit.ReviewPageController(urlParams); //create review page controller with review id
		}
	})
};

rhit.main();