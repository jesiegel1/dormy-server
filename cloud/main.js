//var user = request.user; // request.user replaces Parse.User.current()
//var token = user.getSessionToken(); // get session token from request.user
//query.find({ sessionToken: token }) // pass the session token to find()

var stripe = require('stripe')('sk_test_Dk7KmW7c0h1cJzXFbrbEatY1');

var parseCustomer = Parse.Object.extend("Customer")

Parse.Cloud.define("create_customer", function(request, response) {
	var username = request.params.username
	var email = request.params.email
	console.log(request.params.user)
	console.log(request.params.username)
	stripe.customers.create({
		description: username,
		email: email,
		source: request.params.token
	}).then(function(customer) {
		console.log(customer)
		var newCustomer = new parseCustomer();
		newCustomer.set("username", username);
		newCustomer.set("user", request.user)
		newCustomer.set("email", email)
		newCustomer.set("stripe_id", customer.id);

		console.log(newCustomer)

		

		console.log(request.user)

		Parse.Cloud.useMasterKey();
		var user = Parse.Object.extend("User");
		var query = new Parse.Query(user);
		var token = request.user.getSessionToken(); // get session token from request.user
		query.get(request.user.id, {sessionToken: token}, {
  			success: function(user) {
  				newCustomer.save(null, {
  					success: function(newCustomer) {
  						user.set("customer", newCustomer);
						user.save();
						response.success("Customer created successfully")
  					},
  					error: function(newCustomer, error) {
  						response.error(error)
  					}
  				});
  			},
  			error: function(object, error) {
  			  	response.error(error)
  			}
		});
	}, function(err, customer) {
		console.log(err);
		response.error(err);
	});
});

Parse.Cloud.define("get_customer", function(request, response) {
	var user = request.user
	var token = user.getSessionToken(); // get session token from request.user
	var Customer = Parse.Object.extend("Customer")
	var query = new Parse.Query(Customer);
	query.equalTo("user", user);
	console.log(token)
	query.find({sessionToken: token, useMasterKey: true,
		success: function(results) {
			console.log("success");
			console.log(results);
			if (results.length > 0) {
				var stripeCustomer = results[0]
				var stripe_id = stripeCustomer.get("stripe_id");
				stripe.customers.retrieve(stripe_id).then( 
					function(customer) {
						var data = customer.sources.data[0]
						response.success({ "customer_id": customer.id, "default_source": customer.default_source, "brand": data.brand, "last4": data.last4 })
					}, 
					function(error) {
						console.log(error)
						response.error(error)
					}
				);
			} else {
				response.error("No customer exists.");
			}
		},
		error: function(error) {
			console.log(error)
			response.error(error);
		}
	});
});

Parse.Cloud.define("check_charge", function(request, response) {
	var charge = request.params.chargeID
	stripe.charges.retrieve(charge).then(
		function(charge) {
			var refunded = charge.refunded
			var captured = charge.captured
			response.success({"refunded": refunded, "captured": captured})
		},
		function(error) {
			console.log(error)
			repsonse.error(error)
		}
	);
});

Parse.Cloud.define("charge_customer", function(request, response) {
	var user = request.user
	var token = user.getSessionToken(); // get session token from request.user
	var source = request.params.source
	var packageID = request.params.packageID
	var angular = request.params.angular
	if (angular == true) {
		var jobID = request.params.customerID
		var job = Parse.Object.extend("Job");
		var query = new Parse.Query(job);
		query.include("dormer")
		query.include("dormer.customer")
		query.get(jobID, {sessionToken: token}, {
  			success: function(job) {
  				var customer = job.get("dormer").get("customer")
  				var customerID = customer.get("stripe_id")
  				chargeCustomer({customerID: customerID, packageID: packageID, request: request, response: response, angular: angular, job: job})
  			},
  			error: function(object, error) {
  				console.log(error)
  			  	response.error(error)
  			}
		});
	} else {
		customerID = request.params.customerID
		chargeCustomer({customerID: customerID, packageID: packageID, response: response, angular: angular})
	}

	

	
});

function chargeCustomer(hash) {
	var Package = Parse.Object.extend("Package")
	var query = new Parse.Query(Package);
	query.equalTo("objectId", hash.packageID);
	query.find({
		success: function(results) {
			if (results.length > 0) {
				var dormyPackage = results[0]
				var cost = dormyPackage.get("price")

				stripe.charges.create({
					amount: cost*100,
					currency: "usd",
					capture: false,
					customer: hash.customerID
					//source: source
				}).then(function(charge) {
						var status = charge.status
						if (hash.angular == true) {
							var charge = charge.id
							var parseCharge = Parse.Object.extend("Charge")
							var newCharge = new parseCharge();
							newCharge.set("charge_id", charge);
							newCharge.set("user", hash.request.user);
							newCharge.set("job", hash.job);
							newCharge.save();
							newCharge.save(null, {
  								success: function(newCharge) {
  									var job = hash.job
  									job.set("charge", newCharge);
									job.save();
									hash.response.success("Charge has been updated successfully.")
  								},
  								error: function(newCharge, error) {
  									hash.response.error(error)
  								}
  							});
						} else {
							hash.response.success({"status": status, "charge": charge.id})
						}
					},
					function(error) {
						console.log(error)
						hash.response.error(error)
					}
				);
			}
		},
		error: function(error) {
			console.log(error)
			hash.response.error(error)
		}
	});
}

Parse.Cloud.define("capture_charge", function(request, response) {
	var jobID = request.params.jobID
	var Job = Parse.Object.extend("Job");
	var query = new Parse.Query(Job);
	query.equalTo("objectId", jobID);
	query.include("charge");
	query.find({
		success: function(results) {
			if (results.length > 0) {
				var job = results[0]
				var charge = job.get('charge');
				var chargeID = charge.get('charge_id');
				var stripeSecretKey = "sk_test_Dk7KmW7c0h1cJzXFbrbEatY1"
				var captureURL  = "https://"+stripeSecretKey+":@api.stripe.com/v1/charges/"+chargeID+"/capture";

				stripe.charges.capture(chargeID).then( 
					function (success) {
                        response.success({data: success});
					},
					function(error) {
						console.log(error);
                        response.error(error);
					}
				);
			} else {
				response.error("No such job found");
			}
		},
		error: function(error) {
			console.log(error);
			response.error(error);
		}
	})
})



